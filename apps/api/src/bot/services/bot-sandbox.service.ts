import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { runDetached } from '../../common/async.js';
import { errorMessage } from '../../common/errors.js';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessagesRepository } from '../../telegram/repositories/telegram-messages.repository.js';
import {
  toBotTurnDto,
  toMemoryDto,
  toSandboxJobDto,
  toSandboxMessageDto,
  toSandboxSummaryDto,
} from '../bot.types.js';
import type { SandboxSessionDto, SandboxSummaryDto } from '../bot.types.js';
import { VirtualClock } from '../core/channel.js';
import type { Channel } from '../core/channel.js';
import { findMilestones, lastAnsweredIncoming } from '../core/copied-chat.js';
import { HISTORY_LIMIT } from '../core/history.js';
import type { HistoryMessage, TurnResult } from '../core/types.js';
import type { ManualChatMode } from '../dto/chat.dto.js';
import type { BotChatStateEntity } from '../entities/bot-chat-state.entity.js';
import type { BotSandboxSessionEntity } from '../entities/bot-sandbox-session.entity.js';
import { stageFromMilestones } from '../library/kinds.js';
import { readPersona } from '../library/persona.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import {
  BotMemoryRepository,
  memoryOf,
} from '../repositories/bot-memory.repository.js';
import { BotSandboxRepository } from '../repositories/bot-sandbox.repository.js';
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
    private readonly sandbox: BotSandboxRepository,
    private readonly telegramMessages: TelegramMessagesRepository,
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

  /** Сессии аккаунта одним запросом — вместе с этапом и числом сообщений. */
  async list(account: TelegramAccountEntity): Promise<SandboxSummaryDto[]> {
    const rows = await this.sandbox.listSummaries(account.id, SESSIONS_LIMIT);
    return rows.map((row) =>
      toSandboxSummaryDto(
        row.session,
        row.state,
        stageFromMilestones(row.milestones),
        row.messageCount,
      ),
    );
  }

  async create(
    account: TelegramAccountEntity,
    title: string | undefined,
  ): Promise<SandboxSessionDto> {
    const session = await this.open(
      account.id,
      title || 'Новый диалог',
      null,
      new Date(),
    );
    return this.view(session);
  }

  /**
   * «Продолжить в песочнице»: переписка реального чата (до сообщения
   * включительно, последние 60) копируется, этап восстанавливается по вехам
   * из библиотеки, память — анализатором в фоне. В исходный чат ничего не пишется.
   */
  async fromChat(
    account: TelegramAccountEntity,
    chat: TelegramChatEntity,
    messageId: number | undefined,
  ): Promise<SandboxSessionDto> {
    const latest = await this.telegramMessages.latestUpTo(
      chat.id,
      messageId,
      HISTORY_LIMIT,
    );
    if (!latest) throw new NotFoundException('Сообщение не найдено в чате');
    const source = latest.reverse();
    const last = source[source.length - 1];
    if (!last) throw new BadRequestException('В чате нет сообщений');

    const [session, settings] = await Promise.all([
      this.open(
        account.id,
        `Из чата: ${chat.peerName}`.slice(0, 200),
        chat.id,
        last.sentAt,
      ),
      this.settings.ensure(account.id),
    ]);
    const [ids, library] = await Promise.all([
      this.sandbox.insertMessages(session.id, source),
      this.libraries.load(
        account.id,
        readPersona(settings.persona, account.displayName),
      ),
    ]);
    const history: HistoryMessage[] = source.map((message, index) => ({
      id: ids[index] as number,
      direction: message.direction,
      text: message.text,
      mediaKind: message.mediaKind,
      sentAt: message.sentAt,
      readAt: message.readAt,
    }));

    const milestones = findMilestones(history, library.milestoneBodies());
    await Promise.all([
      this.memories.addSaidEntries(
        session.chatId,
        milestones.map((milestone) => ({
          kind: 'milestone',
          key: milestone.key,
          messageId: milestone.messageId,
          at: milestone.at,
        })),
      ),
      this.states.setLastHandled(
        session.chatId,
        lastAnsweredIncoming(history) ?? 0,
      ),
    ]);

    this.launch(session, async (env) => {
      await this.runner.restoreMemory(session.chatId, account.id, env);
      await this.ladder.reschedule(session.chatId, env.channel);
    });
    return this.view(session);
  }

  async get(
    account: TelegramAccountEntity,
    sessionId: string,
  ): Promise<SandboxSessionDto> {
    return this.view(await this.find(account, sessionId));
  }

  async remove(
    account: TelegramAccountEntity,
    sessionId: string,
  ): Promise<void> {
    const session = await this.find(account, sessionId);
    this.assertIdle(session);
    // Сессия, переписка, память, задания и журнал уходят каскадом от состояния чата.
    await this.states.deleteSandbox(session.chatId);
    this.errors.delete(session.id);
  }

  /**
   * Сообщения за клиента. Если агент в это время отвечает, ход становится
   * устаревшим — как в Telegram, когда клиент дописал: ответ прерывается,
   * и следующий ход берёт все новые сообщения разом.
   */
  async addMessages(
    account: TelegramAccountEntity,
    sessionId: string,
    texts: readonly string[],
  ): Promise<SandboxSessionDto> {
    const session = await this.find(account, sessionId);
    const run = this.runs.get(session.id);
    const clock = run?.clock ?? new VirtualClock(session.virtualNow);
    const start = clock.now().getTime();
    await this.sandbox.insertMessages(
      session.id,
      texts.map((text, index) => ({
        direction: 'in',
        text,
        mediaKind: null,
        sentAt: new Date(start + index * CLIENT_TYPING_MS),
        readAt: null,
      })),
    );
    await clock.sleep((texts.length - 1) * CLIENT_TYPING_MS);
    if (run) {
      run.stale = true;
    } else {
      await this.sandbox.setVirtualNow(session.id, clock.now());
      session.virtualNow = clock.now();
    }
    return this.view(session);
  }

  /** Ответ агента на все сообщения клиента, на которые он ещё не отвечал. */
  async respond(
    account: TelegramAccountEntity,
    sessionId: string,
  ): Promise<SandboxSessionDto> {
    const session = await this.find(account, sessionId);
    this.assertIdle(session);
    const state = await this.requireState(session);
    const pending = await this.sandbox.pendingIncoming(
      session.id,
      state.lastHandledMessageId ?? 0,
    );
    if (pending.length === 0) {
      throw new BadRequestException(
        'Новых сообщений клиента нет — напишите за клиента',
      );
    }

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
  async markRead(
    account: TelegramAccountEntity,
    sessionId: string,
  ): Promise<SandboxSessionDto> {
    const session = await this.find(account, sessionId);
    const clock =
      this.runs.get(session.id)?.clock ?? new VirtualClock(session.virtualNow);
    await this.sandbox.markAllRead(session.id, clock.now());
    // Прочтение двигает лестницу: вместо «непрочитанного» — следующая ступень этапа.
    await this.ladder.reschedule(session.chatId, this.channel(session, clock));
    return this.view(session);
  }

  /**
   * Перемотка виртуального времени: на `minutes` вперёд или, без него, до
   * ближайшего запланированного события. Созревшие задания выполняются по
   * порядку как ходы по расписанию — ровно как их выполнит поллер.
   */
  async advance(
    account: TelegramAccountEntity,
    sessionId: string,
    minutes: number | undefined,
  ): Promise<SandboxSessionDto> {
    const session = await this.find(account, sessionId);
    this.assertIdle(session);
    const target =
      minutes !== undefined
        ? new Date(session.virtualNow.getTime() + minutes * 60_000)
        : (await this.jobs.pending(session.chatId))[0]?.runAt;
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
  async setMode(
    account: TelegramAccountEntity,
    sessionId: string,
    mode: ManualChatMode,
  ): Promise<SandboxSessionDto> {
    const session = await this.find(account, sessionId);
    await this.states.setMode(session.chatId, account.id, mode);
    return this.view(session);
  }

  // --- внутреннее -------------------------------------------------------------

  /** Новая сессия — виртуальный чат с `sandbox = true` и своими часами. */
  private async open(
    accountId: string,
    title: string,
    sourceChatId: string | null,
    virtualNow: Date,
  ): Promise<BotSandboxSessionEntity> {
    const chatId = randomUUID();
    await this.states.createSandbox(chatId, accountId);
    return this.sandbox.create({
      accountId,
      chatId,
      title,
      sourceChatId,
      virtualNow,
    });
  }

  private async find(
    account: TelegramAccountEntity,
    sessionId: string,
  ): Promise<BotSandboxSessionEntity> {
    const session = await this.sandbox.findOwned(account.id, sessionId);
    if (!session) throw new NotFoundException('Сессия песочницы не найдена');
    return session;
  }

  private async requireState(
    session: BotSandboxSessionEntity,
  ): Promise<BotChatStateEntity> {
    return requireSessionState(await this.states.find(session.chatId));
  }

  private assertIdle(session: BotSandboxSessionEntity): void {
    if (this.runs.has(session.id)) {
      throw new ConflictException('Агент ещё отвечает — дождитесь конца хода');
    }
  }

  /** Отправленное ходом: чья это часть, веха ли, с какими задержками. */
  private async record(
    session: BotSandboxSessionEntity,
    result: TurnResult,
  ): Promise<void> {
    if (result.status === 'failed' && result.error) {
      this.errors.set(session.id, result.error);
    }
    await this.sandbox.recordSent(
      session.id,
      result.turnId || null,
      result.sent,
    );
  }

  /**
   * Фоновая работа в сессии со своими виртуальными часами. Ошибка работы
   * видна в сессии (`lastError`), время сохраняется в конце в любом случае.
   */
  private launch(
    session: BotSandboxSessionEntity,
    work: (env: SandboxEnvironment) => Promise<void>,
  ): void {
    const run: Run = {
      clock: new VirtualClock(session.virtualNow),
      stale: false,
    };
    this.runs.set(session.id, run);
    this.errors.delete(session.id);
    const env: SandboxEnvironment = {
      channel: this.channel(session, run.clock),
      clock: run.clock,
      isStale: () => run.stale,
    };
    const task = async () => {
      try {
        await work(env);
      } catch (error) {
        const message = errorMessage(error);
        this.errors.set(session.id, message);
        this.logger.warn(`Песочница ${session.id}: ${message}`);
      } finally {
        try {
          await this.sandbox.setVirtualNow(session.id, run.clock.now());
        } finally {
          this.runs.delete(session.id);
        }
      }
    };
    runDetached(
      task(),
      this.logger,
      `Песочница ${session.id}: время не сохранено`,
    );
  }

  private channel(
    session: BotSandboxSessionEntity,
    clock: VirtualClock,
  ): Channel {
    return {
      send: async (_chatId, text) => {
        const [messageId] = await this.sandbox.insertMessages(session.id, [
          {
            direction: 'out',
            text,
            mediaKind: null,
            sentAt: clock.now(),
            readAt: null,
          },
        ]);
        return { messageId: messageId as number };
      },
      setTyping: async () => undefined,
      markRead: async () => undefined,
      history: async (_chatId, limit) => {
        const rows = await this.sandbox.latest(session.id, limit);
        return rows.map((row) => ({
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

  /**
   * Сессия целиком для веба. Веб опрашивает её, пока идёт ход, поэтому все
   * части читаются параллельно — одно обращение к базе по времени.
   */
  private async view(
    session: BotSandboxSessionEntity,
  ): Promise<SandboxSessionDto> {
    const [found, records, messages, jobs, turns, fresh] = await Promise.all([
      this.states.find(session.chatId),
      this.memories.records(session.chatId),
      this.sandbox.latest(session.id, MESSAGES_LIMIT),
      this.jobs.listForChat(session.chatId),
      this.turns.listRecent(session.chatId, TURNS_LIMIT),
      this.sandbox.findById(session.id),
    ]);
    const state = requireSessionState(found);
    const memory = memoryOf(state, records);
    const current = fresh ?? session;
    const stage = stageFromMilestones(
      memory.said
        .filter((entry) => entry.kind === 'milestone')
        .map((entry) => entry.key),
    );
    const handled = state.lastHandledMessageId ?? 0;
    const nextJob = jobs.find((job) => job.status === 'pending');
    return {
      ...toSandboxSummaryDto(current, state, stage, messages.length),
      // Идущий ход двигает часы в памяти — показываем их, а не сохранённые.
      virtualNow: (
        this.runs.get(session.id)?.clock.now() ?? current.virtualNow
      ).toISOString(),
      running: this.runs.has(session.id),
      lastError: this.errors.get(session.id) ?? null,
      handoffReason: state.handoffReason,
      pendingCount: messages.filter(
        (message) => message.direction === 'in' && message.id > handled,
      ).length,
      messages: messages.map(toSandboxMessageDto),
      memory: toMemoryDto(state, memory),
      jobs: jobs.map(toSandboxJobDto),
      nextJob: nextJob ? toSandboxJobDto(nextJob) : null,
      turns: turns.map(toBotTurnDto),
    };
  }
}

function requireSessionState(
  state: BotChatStateEntity | null,
): BotChatStateEntity {
  if (!state) {
    throw new NotFoundException('Состояние сессии песочницы не найдено');
  }
  return state;
}
