import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import type { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { mediaKindOf, messageSentAt, messageText } from '../../telegram/lib/telegram-objects.js';
import { TelegramAccountsRepository } from '../../telegram/repositories/telegram-accounts.repository.js';
import { TelegramChatsRepository } from '../../telegram/repositories/telegram-chats.repository.js';
import { TelegramMessagesRepository } from '../../telegram/repositories/telegram-messages.repository.js';
import { TelegramEventsService } from '../../telegram/runtime/telegram-events.service.js';
import type { TelegramLiveEvent, TelegramMessageEvent } from '../../telegram/runtime/telegram-events.service.js';
import { TelegramOutboundService } from '../../telegram/runtime/telegram-outbound.service.js';
import { TelegramIngestService } from '../../telegram/services/telegram-ingest.service.js';
import { TelegramConfig } from '../../telegram/telegram.config.js';
import { RealClock } from '../core/channel.js';
import type { Channel } from '../core/channel.js';
import { HISTORY_LIMIT, unansweredIncoming } from '../core/history.js';
import { OwnOutgoing, isNewLead } from '../core/telegram-inbox.js';
import { TurnCollector } from '../core/turn-collector.js';
import type { Range, Timings } from '../library/timings.js';
import { readTimings } from '../library/timings.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotLadderService } from './bot-ladder.service.js';
import { BotSchedulerService } from './bot-scheduler.service.js';
import type { BotChannelProvider } from './bot-scheduler.service.js';
import { BotSettingsService } from './bot-settings.service.js';
import { TurnRunnerService } from './turn-runner.service.js';
import type { TurnEnvironment } from './turn-runner.service.js';

/** Как часто проверять, у каких чатов закрылось окно тишины. */
const COLLECTOR_TICK_MS = 1_000;
/** Настройки аккаунта (включён ли агент, тайминги) кэшируются на столько. */
const SETTINGS_TTL_MS = 15_000;

interface AccountAgent {
  enabled: boolean;
  enabledAt: Date | null;
  timings: Timings;
  loadedAt: number;
}

function randomIn(range: Range): number {
  return range.min + Math.random() * (range.max - range.min);
}

/**
 * Агент в Telegram (docs/agent-architecture.md, разделы 3.1–3.2 и 8):
 * `Inbox` над шиной событий Telegram-модуля и `Channel` над его отправкой.
 *
 * - Входящее в чате агента копится сборщиком хода до окна тишины; «печатает»
 *   продлевает окно. Ход берёт все неотвеченные сообщения из базы.
 * - Новый диалог, начатый клиентом после включения агента на аккаунте,
 *   агент берёт сам (`mode = auto`); старые чаты — только если включить руками.
 *   Переключатель аккаунта означает «брать новые диалоги»: чат, включённый
 *   руками, агент ведёт и при выключенном — так тестовый чат не тянет за
 *   собой настоящих клиентов.
 * - Любое исходящее не от агента (менеджер из веба или с телефона) —
 *   передача менеджеру «чужое исходящее».
 * - «Прочитано» пересчитывает лестницу молчания.
 * - Аккаунт снова в сети — неотвеченные сообщения подхватываются заданием.
 *
 * Здесь же канал для поллера лестницы (`BotChannelProvider`).
 */
@Injectable()
export class BotTelegramService implements OnApplicationBootstrap, OnModuleDestroy, BotChannelProvider {
  private readonly logger = new Logger(BotTelegramService.name);
  private readonly clock = new RealClock();
  private readonly collector = new TurnCollector();
  /** Аккаунт чата, в котором копится ход. */
  private readonly chatAccounts = new Map<string, string>();
  /** Чат по собеседнику — чтобы «печатает» не ходило в базу. */
  private readonly chatsByPeer = new Map<string, string>();
  /** Чаты, где сейчас идёт ход клиента. */
  private readonly running = new Set<string>();
  /** Свои исходящие — всё остальное исходящее написал человек. */
  private readonly own = new OwnOutgoing();
  private readonly agents = new Map<string, AccountAgent>();
  private subscription: Subscription | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly telegramConfig: TelegramConfig,
    private readonly events: TelegramEventsService,
    private readonly outbound: TelegramOutboundService,
    private readonly ingest: TelegramIngestService,
    private readonly accounts: TelegramAccountsRepository,
    private readonly chats: TelegramChatsRepository,
    private readonly messages: TelegramMessagesRepository,
    private readonly settings: BotSettingsService,
    private readonly states: BotChatStateRepository,
    private readonly jobs: BotJobsRepository,
    private readonly runner: TurnRunnerService,
    private readonly ladder: BotLadderService,
    private readonly scheduler: BotSchedulerService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.telegramConfig.enabled) {
      this.logger.log('Telegram выключен — агент работает только в песочнице');
      return;
    }
    this.subscription = this.events.subscribe((event) => this.onEvent(event));
    this.timer = setInterval(() => this.tick(), COLLECTOR_TICK_MS);
    this.timer.unref?.();
    this.scheduler.registerChannels(this);
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.timer) clearInterval(this.timer);
  }

  // --- BotChannelProvider ---------------------------------------------------

  async environment(chatId: string, accountId: string): Promise<TurnEnvironment | null> {
    if (!this.outbound.isOnline(accountId)) return null;
    // Ход по заданию устаревает, если клиент написал во время него.
    const generation = this.collector.currentGeneration(chatId);
    return {
      channel: this.channel(accountId),
      clock: this.clock,
      isStale: () => this.collector.currentGeneration(chatId) !== generation,
    };
  }

  isCollecting(chatId: string): boolean {
    return this.collector.hasPending(chatId) || this.running.has(chatId);
  }

  /** Режим чата сменили руками: лестница заново от текущего этапа (или снята, если не `auto`). */
  async modeChanged(chatId: string, accountId: string): Promise<void> {
    this.collector.invalidate(chatId);
    await this.ladder.reschedule(chatId, this.channel(accountId));
  }

  // --- события ---------------------------------------------------------------

  private async onEvent(event: TelegramLiveEvent): Promise<void> {
    switch (event.kind) {
      case 'message':
        if (event.direction === 'in') await this.onIncoming(event);
        else await this.onOutgoing(event);
        return;
      case 'typing': {
        const chatId = this.chatsByPeer.get(`${event.accountId}:${event.peerId}`);
        if (!chatId) return;
        const agent = await this.agent(event.accountId);
        this.collector.typing(chatId, this.clock.now(), agent.timings.typingExtendSec * 1000);
        return;
      }
      case 'read': {
        const state = await this.states.find(event.chat.id);
        if (!state || state.mode !== 'auto' || state.sandbox) return;
        await this.ladder.reschedule(event.chat.id, this.channel(event.accountId));
        return;
      }
      case 'account-live':
        await this.recover(event.accountId);
        return;
      default:
        return;
    }
  }

  private async onIncoming(event: TelegramMessageEvent): Promise<void> {
    const chat = event.chat;
    let state = await this.states.find(chat.id);
    // Чат у менеджера: клиент написал — «нужен ответ» (снимет ответ менеджера).
    if (state?.mode === 'manager' && !state.sandbox) {
      if (state.label !== 'needs_reply') await this.states.setLabel(chat.id, 'needs_reply');
      return;
    }
    const agent = await this.agent(event.accountId);
    if (!state) {
      // Сам агент берёт только новые диалоги и только если включён на аккаунте.
      if (!agent.enabled || !isNewLead(chat, agent.enabledAt)) return;
      state = await this.states.setMode(chat.id, event.accountId, 'auto');
      this.logger.log(`Агент взял новый диалог: ${chat.peerName} (${chat.id})`);
    }
    if (state.mode !== 'auto' || state.sandbox) return;

    const message = event.message;
    this.chatAccounts.set(chat.id, event.accountId);
    this.chatsByPeer.set(`${event.accountId}:${chat.peerId}`, chat.id);
    this.collector.push(
      chat.id,
      { id: message.id, text: messageText(message), mediaKind: mediaKindOf(message.media), sentAt: messageSentAt(message) },
      this.clock.now(),
      { quietMs: randomIn(agent.timings.quietWindowSec) * 1000, maxMs: agent.timings.quietMaxSec * 1000 },
    );
  }

  /** Исходящее не от агента в чате агента — менеджер взял разговор. */
  private async onOutgoing(event: TelegramMessageEvent): Promise<void> {
    const chatId = event.chat.id;
    if (this.own.isOwn(chatId, event.message.id, messageText(event.message))) return;
    const state = await this.states.find(chatId);
    if (!state || state.sandbox) return;
    if (state.mode === 'manager') {
      // Менеджер ответил — чат больше не ждёт.
      if (state.label !== null) await this.states.setLabel(chatId, null);
      return;
    }
    if (state.mode !== 'auto') return;
    this.collector.invalidate(chatId);
    await this.runner.handoff(chatId, 'foreign_outgoing');
    this.logger.log(`Чат ${event.chat.peerName}: написал человек — чат у менеджера`);
  }

  /** Неотвеченное за время простоя — заданием `reply`, его выполнит поллер. */
  private async recover(accountId: string): Promise<void> {
    const chatIds = await this.states.awaitingReply(accountId);
    for (const chatId of chatIds) {
      await this.jobs.createMany(chatId, [{ kind: 'reply', runAt: this.clock.now() }]);
    }
    if (chatIds.length > 0) this.logger.log(`Аккаунт ${accountId}: без ответа осталось чатов — ${chatIds.length}, ответы поставлены`);
  }

  // --- ходы клиента ------------------------------------------------------------

  private tick(): void {
    for (const chatId of this.collector.due(this.clock.now())) {
      // Идёт ход — новое сообщение уже сделало его устаревшим; ждём конца.
      if (this.running.has(chatId)) continue;
      this.collector.take(chatId);
      const accountId = this.chatAccounts.get(chatId);
      if (!accountId) continue;
      this.running.add(chatId);
      void this.clientTurn(chatId, accountId)
        .catch((error: unknown) => this.logger.error(`Ход в чате ${chatId}: ${error instanceof Error ? error.message : String(error)}`))
        .finally(() => this.running.delete(chatId));
    }
  }

  private async clientTurn(chatId: string, accountId: string): Promise<void> {
    const state = await this.states.find(chatId);
    if (!state || state.mode !== 'auto') return;
    const env = await this.environment(chatId, accountId);
    if (!env) {
      // Канала нет (аккаунт отключился) — ответ подхватит поллер, когда он вернётся.
      await this.jobs.createMany(chatId, [{ kind: 'reply', runAt: new Date(this.clock.now().getTime() + 5 * 60_000) }]);
      return;
    }
    // Все неотвеченные: и собранные сейчас, и оставшиеся от прерванного хода.
    const history = await env.channel.history(chatId, HISTORY_LIMIT);
    const messages = unansweredIncoming(history, state.lastHandledMessageId ?? 0);
    if (messages.length === 0) return;
    const generation = this.collector.currentGeneration(chatId);
    await this.runner.run(
      { chatId, accountId, trigger: 'client', messages, job: null, generationSeq: state.generationSeq + 1 },
      { ...env, isStale: () => this.collector.currentGeneration(chatId) !== generation },
    );
  }

  // --- канал -------------------------------------------------------------------

  private channel(accountId: string): Channel {
    return {
      send: async (chatId, text) => {
        const chat = await this.requireChat(accountId, chatId);
        const done = this.own.sending(chatId, text);
        try {
          const sent = await this.outbound.sendText(accountId, chat, text);
          this.own.sent(chatId, sent.id);
          await this.ingest.storeOwnOutgoing(chat, sent);
          const account = await this.accounts.findById(accountId);
          if (account) {
            // В веб — как любое исходящее; своё эхо этот сервис узнает по id.
            this.events.emit({ kind: 'message', accountId, userId: account.userId, chat, message: sent, direction: 'out' });
          }
          return { messageId: sent.id };
        } finally {
          done();
        }
      },
      setTyping: async (chatId, on) => {
        const chat = await this.chats.findOwned(accountId, chatId);
        if (chat) await this.outbound.setTyping(accountId, chat, on);
      },
      markRead: async (chatId) => {
        const chat = await this.chats.findOwned(accountId, chatId);
        if (chat) await this.outbound.markRead(accountId, chat);
      },
      history: async (chatId, limit) => {
        const rows = await this.messages.page(chatId, null, limit);
        return rows.reverse().map((row) => ({
          id: row.telegramMessageId,
          direction: row.direction,
          text: row.text,
          mediaKind: row.mediaKind,
          sentAt: row.sentAt,
          readAt: row.readAt,
        }));
      },
    };
  }

  private async requireChat(accountId: string, chatId: string): Promise<TelegramChatEntity> {
    const chat = await this.chats.findOwned(accountId, chatId);
    if (!chat) throw new Error(`Чат ${chatId} не найден у аккаунта ${accountId}`);
    return chat;
  }

  private async agent(accountId: string, fresh = false): Promise<AccountAgent> {
    const cached = this.agents.get(accountId);
    if (cached && !fresh && Date.now() - cached.loadedAt < SETTINGS_TTL_MS) return cached;
    const account = await this.accounts.findById(accountId);
    const settings = account ? await this.settings.ensure(account) : null;
    const agent: AccountAgent = {
      enabled: settings?.enabled ?? false,
      enabledAt: settings?.enabledAt ?? null,
      timings: readTimings(settings?.timings),
      loadedAt: Date.now(),
    };
    this.agents.set(accountId, agent);
    return agent;
  }
}
