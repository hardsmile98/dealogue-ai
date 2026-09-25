import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Subscription } from 'rxjs';
import { runDetached } from '../../common/async.js';
import { whenListening } from '../../common/lifecycle.js';
import {
  mediaKindOf,
  messageSentAt,
  messageText,
} from '../../telegram/lib/telegram-objects.js';
import { TelegramEventsService } from '../../telegram/runtime/telegram-events.service.js';
import type {
  TelegramLiveEvent,
  TelegramMessageEvent,
} from '../../telegram/runtime/telegram-events.service.js';
import { TelegramConfig } from '../../telegram/telegram.config.js';
import { RealClock } from '../core/channel.js';
import { HISTORY_LIMIT, unansweredIncoming } from '../core/history.js';
import { isNewLead } from '../core/telegram-inbox.js';
import { TurnCollector } from '../core/turn-collector.js';
import type { Range } from '../library/timings.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotLadderService } from './bot-ladder.service.js';
import { BotSchedulerService } from './bot-scheduler.service.js';
import type { BotChannelProvider } from './bot-scheduler.service.js';
import { BotSettingsService } from './bot-settings.service.js';
import type { AgentSwitch } from './bot-settings.service.js';
import { BotTelegramChannels } from './bot-telegram-channels.service.js';
import { TurnRunnerService } from './turn-runner.service.js';
import type { TurnEnvironment } from './turn-runner.service.js';

/** Как часто проверять, у каких чатов закрылось окно тишины. */
const COLLECTOR_TICK_MS = 1_000;
/** Настройки аккаунта (включён ли агент, тайминги) кэшируются на столько. */
const SETTINGS_TTL_MS = 15_000;
/** Канала нет (аккаунт отключился) — ответ клиенту откладывается на столько. */
const OFFLINE_REPLY_DELAY_MS = 5 * 60_000;

interface CachedAgent extends AgentSwitch {
  loadedAt: number;
}

function randomIn(range: Range): number {
  return range.min + Math.random() * (range.max - range.min);
}

/**
 * Агент в Telegram (docs/agent-architecture.md, разделы 3.1–3.2 и 8):
 * `Inbox` над шиной событий Telegram-модуля, `Channel` — BotTelegramChannels.
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
 * Здесь же канал для поллера лестницы (`BotChannelProvider`). Подписка на
 * шину, сборщик и поллер стартуют, когда HTTP-сервер занял порт.
 */
@Injectable()
export class BotTelegramService
  implements OnModuleInit, OnModuleDestroy, BotChannelProvider
{
  private readonly logger = new Logger(BotTelegramService.name);
  private readonly clock = new RealClock();
  private readonly collector = new TurnCollector();
  /** Аккаунт чата, в котором копится ход. */
  private readonly chatAccounts = new Map<string, string>();
  /** Чат по собеседнику — чтобы «печатает» не ходило в базу. */
  private readonly chatsByPeer = new Map<string, string>();
  /** Чаты, где сейчас идёт ход клиента. */
  private readonly running = new Set<string>();
  private readonly agents = new Map<string, CachedAgent>();
  private listening: Subscription | null = null;
  private subscription: Subscription | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly telegramConfig: TelegramConfig,
    private readonly adapterHost: HttpAdapterHost,
    private readonly events: TelegramEventsService,
    private readonly channels: BotTelegramChannels,
    private readonly settings: BotSettingsService,
    private readonly states: BotChatStateRepository,
    private readonly jobs: BotJobsRepository,
    private readonly runner: TurnRunnerService,
    private readonly ladder: BotLadderService,
    private readonly scheduler: BotSchedulerService,
  ) {}

  onModuleInit(): void {
    if (!this.telegramConfig.enabled) {
      this.logger.log('Telegram выключен — агент работает только в песочнице');
      return;
    }
    this.listening = whenListening(
      this.adapterHost,
      this.logger,
      'Запуск Telegram-канала агента',
      () => this.start(),
    );
  }

  /** Остановка: новые события и ходы больше не принимаются, поллер стоит. */
  onModuleDestroy(): void {
    this.listening?.unsubscribe();
    this.subscription?.unsubscribe();
    this.subscription = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // --- BotChannelProvider ---------------------------------------------------

  async environment(
    chatId: string,
    accountId: string,
  ): Promise<TurnEnvironment | null> {
    if (!this.channels.isOnline(accountId)) return null;
    // Ход по заданию устаревает, если клиент написал во время него.
    const generation = this.collector.currentGeneration(chatId);
    return {
      channel: this.channels.forAccount(accountId),
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
    await this.ladder.reschedule(chatId, this.channels.forAccount(accountId));
  }

  // --- события ---------------------------------------------------------------

  private start(): void {
    this.subscription = this.events.subscribe((event) => this.onEvent(event));
    this.timer = setInterval(() => this.tick(), COLLECTOR_TICK_MS);
    this.timer.unref?.();
    this.scheduler.registerChannels(this);
  }

  private async onEvent(event: TelegramLiveEvent): Promise<void> {
    switch (event.kind) {
      case 'message':
        if (event.direction === 'in') await this.onIncoming(event);
        else await this.onOutgoing(event);
        return;
      case 'typing': {
        const chatId = this.chatsByPeer.get(
          `${event.accountId}:${event.peerId}`,
        );
        if (!chatId) return;
        const agent = await this.agent(event.accountId);
        this.collector.typing(
          chatId,
          this.clock.now(),
          agent.timings.typingExtendSec * 1000,
        );
        return;
      }
      case 'read': {
        const state = await this.states.find(event.chat.id);
        if (!state || state.mode !== 'auto' || state.sandbox) return;
        await this.ladder.reschedule(
          event.chat.id,
          this.channels.forAccount(event.accountId),
        );
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
      if (state.label !== 'needs_reply') {
        await this.states.setLabel(chat.id, 'needs_reply');
      }
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
      {
        id: message.id,
        text: messageText(message),
        mediaKind: mediaKindOf(message.media),
        sentAt: messageSentAt(message),
      },
      this.clock.now(),
      {
        quietMs: randomIn(agent.timings.quietWindowSec) * 1000,
        maxMs: agent.timings.quietMaxSec * 1000,
      },
    );
  }

  /** Исходящее не от агента в чате агента — менеджер взял разговор. */
  private async onOutgoing(event: TelegramMessageEvent): Promise<void> {
    const chatId = event.chat.id;
    const own = this.channels.own.isOwn(
      chatId,
      event.message.id,
      messageText(event.message),
    );
    if (own) return;
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
    this.logger.log(
      `Чат ${event.chat.peerName}: написал человек — чат у менеджера`,
    );
  }

  /** Неотвеченное за время простоя — заданием `reply` (одним INSERT), его выполнит поллер. */
  private async recover(accountId: string): Promise<void> {
    const chatIds = await this.states.awaitingReply(accountId);
    if (chatIds.length === 0) return;
    await this.jobs.createForChats(chatIds, {
      kind: 'reply',
      runAt: this.clock.now(),
    });
    this.logger.log(
      `Аккаунт ${accountId}: без ответа осталось чатов — ${chatIds.length}, ответы поставлены`,
    );
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
      runDetached(
        this.clientTurn(chatId, accountId).finally(() =>
          this.running.delete(chatId),
        ),
        this.logger,
        `Ход в чате ${chatId}`,
      );
    }
  }

  private async clientTurn(chatId: string, accountId: string): Promise<void> {
    const state = await this.states.find(chatId);
    if (!state || state.mode !== 'auto') return;
    const env = await this.environment(chatId, accountId);
    if (!env) {
      // Канала нет (аккаунт отключился) — ответ подхватит поллер, когда он вернётся.
      await this.jobs.createMany(chatId, [
        {
          kind: 'reply',
          runAt: new Date(this.clock.now().getTime() + OFFLINE_REPLY_DELAY_MS),
        },
      ]);
      return;
    }
    // Все неотвеченные: и собранные сейчас, и оставшиеся от прерванного хода.
    const history = await env.channel.history(chatId, HISTORY_LIMIT);
    const messages = unansweredIncoming(
      history,
      state.lastHandledMessageId ?? 0,
    );
    if (messages.length === 0) return;
    const generation = this.collector.currentGeneration(chatId);
    await this.runner.run(
      {
        chatId,
        accountId,
        trigger: 'client',
        messages,
        job: null,
        generationSeq: state.generationSeq + 1,
      },
      {
        ...env,
        isStale: () => this.collector.currentGeneration(chatId) !== generation,
      },
    );
  }

  /** Включён ли агент и тайминги аккаунта — с кэшем на SETTINGS_TTL_MS. */
  private async agent(accountId: string): Promise<AgentSwitch> {
    const cached = this.agents.get(accountId);
    if (cached && Date.now() - cached.loadedAt < SETTINGS_TTL_MS) {
      return cached;
    }
    const agent: CachedAgent = {
      ...(await this.settings.agentSwitch(accountId)),
      loadedAt: Date.now(),
    };
    this.agents.set(accountId, agent);
    return agent;
  }
}
