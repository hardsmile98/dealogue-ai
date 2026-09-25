import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execute } from '../../database/sql.js';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../telegram/entities/telegram-message.entity.js';
import { toMemoryDto, toSandboxJobDto, toSandboxMessageDto, toSandboxTurnDto } from '../bot.types.js';
import type { SandboxSessionDto, SandboxSummaryDto } from '../bot.types.js';
import { VirtualClock } from '../core/channel.js';
import type { Channel } from '../core/channel.js';
import { findMilestones, lastAnsweredIncoming } from '../core/copied-chat.js';
import { HISTORY_LIMIT } from '../core/history.js';
import type { HistoryMessage, IncomingMessage, TurnResult } from '../core/types.js';
import type { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import { BotSandboxMessageEntity } from '../entities/bot-sandbox-message.entity.js';
import { BotSandboxSessionEntity } from '../entities/bot-sandbox-session.entity.js';
import { stageFromMilestones } from '../library/kinds.js';
import type { ManualChatMode } from '../dto/chat.dto.js';
import type { Stage } from '../library/kinds.js';
import { readPersona } from '../library/persona.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotMemoryRepository } from '../repositories/bot-memory.repository.js';
import { BotTurnsRepository } from '../repositories/bot-turns.repository.js';
import { BotJobExecutor } from './bot-job-executor.service.js';
import { BotLadderService } from './bot-ladder.service.js';
import { BotSettingsService } from './bot-settings.service.js';
import { LibraryContextService } from './library-context.service.js';
import { TurnRunnerService } from './turn-runner.service.js';
import type { TurnEnvironment } from './turn-runner.service.js';

/** Сколько виртуального времени клиент «набирает» одно сообщение. */
const CLIENT_TYPING_MS = 15_000;
const SESSIONS_LIMIT = 50;
const MESSAGES_LIMIT = 500;
const TURNS_LIMIT = 30;
/** Страховка перемотки: больше ходов за одну перемотку не выполняется. */
const ADVANCE_MAX_JOBS = 20;

/** Фоновый запуск в сессии: его часы и отметка «клиент дописал, пока агент отвечал». */
interface Run {
  clock: VirtualClock;
  stale: boolean;
}

type SandboxEnvironment = TurnEnvironment & { clock: VirtualClock };

/**
 * Песочница (docs/agent-architecture.md, раздел 8): тот же исполнитель
 * хода, что у Telegram, но канал пишет в bot_sandbox_messages, а часы
 * виртуальные — задержки доставки не ждутся, а сдвигают время. Ходы идут
 * в фоне (модель отвечает секунды), веб опрашивает сессию, пока `running`.
 */
@Injectable()
export class BotSandboxService {
  private readonly logger = new Logger(BotSandboxService.name);
  private readonly runs = new Map<string, Run>();
  private readonly errors = new Map<string, string>();

  constructor(
    @InjectRepository(BotSandboxSessionEntity)
    private readonly sessions: Repository<BotSandboxSessionEntity>,
    @InjectRepository(BotSandboxMessageEntity)
    private readonly messages: Repository<BotSandboxMessageEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly telegramMessages: Repository<TelegramMessageEntity>,
    private readonly states: BotChatStateRepository,
    private readonly memories: BotMemoryRepository,
    private readonly turns: BotTurnsRepository,
    private readonly jobs: BotJobsRepository,
    private readonly settings: BotSettingsService,
    private readonly libraries: LibraryContextService,
    private readonly runner: TurnRunnerService,
    private readonly ladder: BotLadderService,
    private readonly executor: BotJobExecutor,
  ) {}

  async list(account: TelegramAccountEntity): Promise<SandboxSummaryDto[]> {
    const sessions = await this.sessions.find({
      where: { accountId: account.id },
      order: { createdAt: 'DESC' },
      take: SESSIONS_LIMIT,
    });
    return Promise.all(
      sessions.map(async (session) => {
        const [state, milestones, messageCount] = await Promise.all([
          this.requireState(session),
          this.states.deliveredMilestones(session.chatId),
          this.messages.count({ where: { sessionId: session.id } }),
        ]);
        return this.summaryDto(session, state, stageFromMilestones(milestones), messageCount);
      }),
    );
  }

  async create(account: TelegramAccountEntity, title: string | undefined): Promise<SandboxSessionDto> {
    const session = await this.open(account.id, title || 'Новый диалог', null, new Date());
    return this.view(session);
  }

  /**
   * «Продолжить в песочнице»: переписка реального чата (до сообщения
   * включительно, последние 60) копируется, этап восстанавливается по вехам
   * из библиотеки, память — анализатором в фоне. В исходный чат ничего не пишется.
   */
  async fromChat(account: TelegramAccountEntity, chat: TelegramChatEntity, messageId: number | undefined): Promise<SandboxSessionDto> {
    const source = await this.copySource(chat.id, messageId);
    const last = source[source.length - 1];
    if (!last) throw new BadRequestException('В чате нет сообщений');

    const session = await this.open(account.id, `Из чата: ${chat.peerName}`.slice(0, 200), chat.id, last.sentAt);
    const inserted = await this.messages.insert(
      source.map((message) => ({
        sessionId: session.id,
        direction: message.direction,
        text: message.text,
        mediaKind: message.mediaKind,
        sentAt: message.sentAt,
        readAt: message.readAt,
      })),
    );
    const history: HistoryMessage[] = source.map((message, index) => ({
      id: Number(inserted.identifiers[index]?.id),
      direction: message.direction,
      text: message.text,
      mediaKind: message.mediaKind,
      sentAt: message.sentAt,
      readAt: message.readAt,
    }));

    const settings = await this.settings.ensure(account);
    const library = await this.libraries.load(account.id, readPersona(settings.persona, account.displayName));
    for (const milestone of findMilestones(history, library.milestoneBodies())) {
      await this.memories.addSaid(session.chatId, [{ kind: 'milestone', key: milestone.key, messageId: milestone.messageId }], milestone.at);
    }
    await execute(this.sessions.manager, `UPDATE bot_chat_state SET last_handled_message_id = $2::int WHERE chat_id = $1::uuid`, [
      session.chatId,
      lastAnsweredIncoming(history) ?? 0,
    ]);

    this.launch(session, async (env) => {
      await this.runner.restoreMemory(session.chatId, account.id, env);
      await this.ladder.reschedule(session.chatId, env.channel);
    });
    return this.view(session);
  }

  async get(account: TelegramAccountEntity, sessionId: string): Promise<SandboxSessionDto> {
    return this.view(await this.find(account, sessionId));
  }

  async remove(account: TelegramAccountEntity, sessionId: string): Promise<void> {
    const session = await this.find(account, sessionId);
    this.assertIdle(session);
    // Сессия, переписка, память, задания и журнал уходят каскадом от состояния чата.
    await execute(this.sessions.manager, `DELETE FROM bot_chat_state WHERE chat_id = $1::uuid AND sandbox`, [session.chatId]);
    this.errors.delete(session.id);
  }

  /**
   * Сообщения за клиента. Если агент в это время отвечает, ход становится
   * устаревшим — как в Telegram, когда клиент дописал: ответ прерывается,
   * и следующий ход берёт все новые сообщения разом.
   */
  async addMessages(account: TelegramAccountEntity, sessionId: string, texts: readonly string[]): Promise<SandboxSessionDto> {
    const session = await this.find(account, sessionId);
    const run = this.runs.get(session.id);
    const clock = run?.clock ?? new VirtualClock(session.virtualNow);
    const start = clock.now().getTime();
    await this.messages.insert(
      texts.map((text, index) => ({
        sessionId: session.id,
        direction: 'in' as const,
        text,
        sentAt: new Date(start + index * CLIENT_TYPING_MS),
      })),
    );
    await clock.sleep((texts.length - 1) * CLIENT_TYPING_MS);
    if (run) {
      run.stale = true;
    } else {
      await this.sessions.update(session.id, { virtualNow: clock.now() });
      session.virtualNow = clock.now();
    }
    return this.view(session);
  }

  /** Ответ агента на все сообщения клиента, на которые он ещё не отвечал. */
  async respond(account: TelegramAccountEntity, sessionId: string): Promise<SandboxSessionDto> {
    const session = await this.find(account, sessionId);
    this.assertIdle(session);
    const state = await this.requireState(session);
    const pending = await this.pendingMessages(session, state);
    if (pending.length === 0) throw new BadRequestException('Новых сообщений клиента нет — напишите за клиента');

    this.launch(session, async (env) => {
      const result = await this.runner.run(
        {
          chatId: session.chatId,
          accountId: account.id,
          trigger: 'client',
          messages: pending,
          job: null,
          generationSeq: state.generationSeq + 1,
        },
        env,
      );
      await this.record(session, result);
    });
    return this.view(session);
  }

  /** Клиент прочитал всё, что агент отправил. */
  async markRead(account: TelegramAccountEntity, sessionId: string): Promise<SandboxSessionDto> {
    const session = await this.find(account, sessionId);
    const clock = this.runs.get(session.id)?.clock ?? new VirtualClock(session.virtualNow);
    await execute(
      this.messages.manager,
      `UPDATE bot_sandbox_messages SET read_at = $2::timestamptz WHERE session_id = $1::uuid AND direction = 'out' AND read_at IS NULL`,
      [session.id, clock.now()],
    );
    // Прочтение двигает лестницу: вместо «непрочитанного» — следующая ступень этапа.
    await this.ladder.reschedule(session.chatId, this.channel(session, clock));
    return this.view(session);
  }

  /**
   * Перемотка виртуального времени: на `minutes` вперёд или, без него, до
   * ближайшего запланированного события. Созревшие задания выполняются по
   * порядку как ходы по расписанию — ровно как их выполнит поллер.
   */
  async advance(account: TelegramAccountEntity, sessionId: string, minutes: number | undefined): Promise<SandboxSessionDto> {
    const session = await this.find(account, sessionId);
    this.assertIdle(session);
    const next = (await this.jobs.pending(session.chatId))[0];
    const target = minutes !== undefined ? new Date(session.virtualNow.getTime() + minutes * 60_000) : next?.runAt;
    if (!target) throw new BadRequestException('Запланированных событий нет');

    this.launch(session, async (env) => {
      const done = new Set<string>();
      for (let step = 0; step < ADVANCE_MAX_JOBS; step += 1) {
        // Ход может поставить новые задания — список читается заново на каждом шаге.
        const job = (await this.jobs.pending(session.chatId)).find(
          (candidate) => candidate.runAt <= target && !done.has(candidate.id),
        );
        if (!job) break;
        done.add(job.id);
        env.clock.advanceTo(job.runAt);
        // Тот же исполнитель, что у поллера боевых чатов.
        const result = await this.executor.execute(job, env);
        if (result) await this.record(session, result);
      }
      env.clock.advanceTo(target);
    });
    return this.view(session);
  }

  /** Режим руками: вернуть агенту после передачи менеджеру или выключить. */
  async setMode(account: TelegramAccountEntity, sessionId: string, mode: ManualChatMode): Promise<SandboxSessionDto> {
    const session = await this.find(account, sessionId);
    await this.states.setMode(session.chatId, account.id, mode);
    return this.view(session);
  }

  private async open(accountId: string, title: string, sourceChatId: string | null, virtualNow: Date): Promise<BotSandboxSessionEntity> {
    const chatId = randomUUID();
    await this.states.setMode(chatId, accountId, 'auto');
    await execute(this.sessions.manager, `UPDATE bot_chat_state SET sandbox = true WHERE chat_id = $1::uuid`, [chatId]);
    return this.sessions.save(this.sessions.create({ accountId, chatId, title, sourceChatId, virtualNow }));
  }

  private async find(account: TelegramAccountEntity, sessionId: string): Promise<BotSandboxSessionEntity> {
    const session = await this.sessions.findOne({ where: { id: sessionId, accountId: account.id } });
    if (!session) throw new NotFoundException('Сессия песочницы не найдена');
    return session;
  }

  private async requireState(session: BotSandboxSessionEntity): Promise<BotChatStateEntity> {
    const state = await this.states.find(session.chatId);
    if (!state) throw new NotFoundException('Состояние сессии песочницы не найдено');
    return state;
  }

  private assertIdle(session: BotSandboxSessionEntity): void {
    if (this.runs.has(session.id)) throw new ConflictException('Агент ещё отвечает — дождитесь конца хода');
  }

  private async copySource(chatId: string, messageId: number | undefined): Promise<TelegramMessageEntity[]> {
    const query = this.telegramMessages.createQueryBuilder('message').where('message.chat_id = :chatId', { chatId });
    if (messageId !== undefined) {
      const target = await this.telegramMessages.findOne({ where: { chatId, telegramMessageId: messageId } });
      if (!target) throw new NotFoundException('Сообщение не найдено в чате');
      query.andWhere('(message.sent_at, message.telegram_message_id) <= (:sentAt, :messageId)', {
        sentAt: target.sentAt,
        messageId: target.telegramMessageId,
      });
    }
    const rows = await query
      .orderBy('message.sent_at', 'DESC')
      .addOrderBy('message.telegram_message_id', 'DESC')
      .limit(HISTORY_LIMIT)
      .getMany();
    return rows.reverse();
  }

  private async pendingMessages(session: BotSandboxSessionEntity, state: BotChatStateEntity): Promise<IncomingMessage[]> {
    const rows = await this.messages
      .createQueryBuilder('message')
      .where('message.session_id = :sessionId AND message.direction = :direction AND message.id > :handled', {
        sessionId: session.id,
        direction: 'in',
        handled: state.lastHandledMessageId ?? 0,
      })
      .orderBy('message.id', 'ASC')
      .getMany();
    return rows.map((row) => ({ id: row.id, text: row.text, mediaKind: row.mediaKind, sentAt: row.sentAt }));
  }

  /** Отправленное ходом: чья это часть, веха ли, с какими задержками. */
  private async record(session: BotSandboxSessionEntity, result: TurnResult): Promise<void> {
    if (result.status === 'failed' && result.error) this.errors.set(session.id, result.error);
    for (const part of result.sent) {
      await execute(
        this.messages.manager,
        `UPDATE bot_sandbox_messages SET block = $2::boolean, delay_ms = $3::int, typing_ms = $4::int, turn_id = $5::uuid
         WHERE id = $1::int AND session_id = $6::uuid`,
        [part.messageId, part.block, Math.round(part.delayMs), Math.round(part.typingMs), result.turnId || null, session.id],
      );
    }
  }

  /** Фоновая работа в сессии со своими виртуальными часами; время сохраняется в конце. */
  private launch(session: BotSandboxSessionEntity, work: (env: SandboxEnvironment) => Promise<void>): void {
    const run: Run = { clock: new VirtualClock(session.virtualNow), stale: false };
    this.runs.set(session.id, run);
    this.errors.delete(session.id);
    const env: SandboxEnvironment = { channel: this.channel(session, run.clock), clock: run.clock, isStale: () => run.stale };
    void (async () => {
      try {
        await work(env);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.errors.set(session.id, message);
        this.logger.warn(`Песочница ${session.id}: ${message}`);
      } finally {
        await this.sessions
          .update(session.id, { virtualNow: run.clock.now() })
          .catch((error: unknown) => this.logger.error(`Песочница ${session.id}: время не сохранено: ${String(error)}`));
        this.runs.delete(session.id);
      }
    })();
  }

  private channel(session: BotSandboxSessionEntity, clock: VirtualClock): Channel {
    return {
      send: async (_chatId, text) => {
        const result = await this.messages.insert({ sessionId: session.id, direction: 'out', text, sentAt: clock.now() });
        return { messageId: Number(result.identifiers[0]?.id) };
      },
      setTyping: async () => undefined,
      markRead: async () => undefined,
      history: async (_chatId, limit) => {
        const rows = await this.messages.find({ where: { sessionId: session.id }, order: { id: 'DESC' }, take: limit });
        return rows.reverse().map((row) => ({
          id: row.id,
          direction: row.direction,
          text: row.text,
          mediaKind: row.mediaKind,
          sentAt: row.sentAt,
          readAt: row.readAt,
        }));
      },
    };
  }

  private async view(session: BotSandboxSessionEntity): Promise<SandboxSessionDto> {
    const state = await this.requireState(session);
    const [memory, rows, jobs, turns, fresh] = await Promise.all([
      this.memories.load(state),
      this.messages.find({ where: { sessionId: session.id }, order: { id: 'DESC' }, take: MESSAGES_LIMIT }),
      this.jobs.listForChat(session.chatId),
      this.turns.listRecent(session.chatId, TURNS_LIMIT),
      this.sessions.findOne({ where: { id: session.id } }),
    ]);
    const messages = rows.reverse();
    const current = fresh ?? session;
    const stage = stageFromMilestones(memory.said.filter((entry) => entry.kind === 'milestone').map((entry) => entry.key));
    const handled = state.lastHandledMessageId ?? 0;
    const pendingJobs = jobs.filter((job) => job.status === 'pending');
    return {
      ...this.summaryDto(current, state, stage, messages.length),
      // Идущий ход двигает часы в памяти — показываем их, а не сохранённые.
      virtualNow: (this.runs.get(session.id)?.clock.now() ?? current.virtualNow).toISOString(),
      running: this.runs.has(session.id),
      lastError: this.errors.get(session.id) ?? null,
      handoffReason: state.handoffReason,
      pendingCount: messages.filter((message) => message.direction === 'in' && message.id > handled).length,
      messages: messages.map(toSandboxMessageDto),
      memory: toMemoryDto(state, memory),
      jobs: jobs.map(toSandboxJobDto),
      nextJob: pendingJobs[0] ? toSandboxJobDto(pendingJobs[0]) : null,
      turns: turns.map(toSandboxTurnDto),
    };
  }

  private summaryDto(session: BotSandboxSessionEntity, state: BotChatStateEntity, stage: Stage, messageCount: number): SandboxSummaryDto {
    return {
      id: session.id,
      accountId: session.accountId,
      title: session.title,
      sourceChatId: session.sourceChatId,
      virtualNow: session.virtualNow.toISOString(),
      stage,
      mode: state.mode,
      label: state.label,
      messageCount,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }
}
