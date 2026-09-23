import { Injectable, Logger } from '@nestjs/common';
import teleproto from 'teleproto';
import type { Api } from 'teleproto';
import type { NewMessageEvent } from 'teleproto/events/NewMessage.js';
import { runDetached } from '../../common/async.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { describeError } from '../lib/telegram-errors.js';
import { asUser, isNonHumanUser, messageDirection } from '../lib/telegram-objects.js';
import { TelegramChatsRepository } from '../repositories/telegram-chats.repository.js';
import { TelegramIngestService } from '../services/telegram-ingest.service.js';
import { TelegramSyncService } from '../services/telegram-sync.service.js';
import type { LiveAccount } from './live-account.js';
import { TelegramEventsService } from './telegram-events.service.js';

const { Api: Tl, events } = teleproto;

/** Сколько свежих диалогов запросить, чтобы найти незнакомого собеседника. */
const RESOLVE_DIALOGS_LIMIT = 30;

/** Чем рантайм отвечает на то, что приём апдейтов сам решить не может. */
export interface UpdateHooks {
  /** Собеседника не удалось определить — пусть его подберёт досинхронизация. */
  requestSync(live: LiveAccount): void;
  /** Ошибка обработки — рантайм решает, переподключаться ли. Не бросает. */
  fail(live: LiveAccount, error: unknown, stage: string): Promise<void>;
}

/** Состояние приёма для одного клиента; живёт, пока обработчики висят на нём. */
interface Binding {
  live: LiveAccount;
  hooks: UpdateHooks;
  /** Диалоги, для которых уже идёт догрузка истории по живому событию. */
  pendingDialogs: Set<string>;
  /** Идущие поиски собеседника по peerId — чтобы не дублировать getDialogs. */
  resolving: Map<string, Promise<Api.User | 'skip' | null>>;
}

/**
 * Приём апдейтов живого клиента: новые сообщения личных чатов пишутся в
 * базу и публикуются в шину; прочтение наших исходящих и «печатает…» —
 * из сырых апдейтов. Жизненным циклом клиента не занимается — это рантайм.
 */
@Injectable()
export class TelegramUpdatesService {
  private readonly logger = new Logger(TelegramUpdatesService.name);

  constructor(
    private readonly sync: TelegramSyncService,
    private readonly ingest: TelegramIngestService,
    private readonly chats: TelegramChatsRepository,
    private readonly events: TelegramEventsService,
  ) {}

  /** Вешает обработчики на клиент аккаунта; возвращает функцию, которая их снимает. */
  bind(live: LiveAccount, hooks: UpdateHooks): () => void {
    const binding: Binding = {
      live,
      hooks,
      pendingDialogs: new Set(),
      resolving: new Map(),
    };
    const messageFilter = new events.NewMessage({});
    const rawFilter = new events.Raw({
      types: [Tl.UpdateReadHistoryOutbox, Tl.UpdateUserTyping],
    });
    const onMessage = (event: NewMessageEvent) => {
      runDetached(this.onNewMessage(binding, event), this.logger, `Аккаунт ${live.label}`);
    };
    const onRaw = (update: Api.TypeUpdate) => {
      runDetached(this.onRawUpdate(binding, update), this.logger, `Аккаунт ${live.label}`);
    };

    live.client.addEventHandler(onMessage, messageFilter);
    live.client.addEventHandler(onRaw as never, rawFilter);
    return () => {
      try {
        live.client.removeEventHandler(onMessage, messageFilter);
        live.client.removeEventHandler(onRaw as never, rawFilter);
      } catch {
        // Обработчики уже сняты вместе с клиентом.
      }
    };
  }

  private async onNewMessage(binding: Binding, event: NewMessageEvent): Promise<void> {
    const { live } = binding;
    if (live.stopped || !event.isPrivate) return;
    const message = event.message;
    if (!message || message.className !== 'Message') return;
    const peer = message.peerId;
    if (!(peer instanceof Tl.PeerUser)) return;
    const peerId = peer.userId.toString();

    try {
      const user = await this.resolvePeerUser(binding, peerId, event);
      if (user === 'skip') return;
      if (user === null) {
        // Собеседника не нашли даже в свежих диалогах — пусть подберёт синхронизация.
        this.logger.warn(
          `Аккаунт ${live.label}: не удалось определить собеседника ${peerId}, догружаем через синхронизацию`,
        );
        binding.hooks.requestSync(live);
        return;
      }

      const chat = await this.ingest.upsertChat(live.id, user);
      this.logger.log(
        `Аккаунт ${live.label}: ${message.out ? 'исходящее для' : 'входящее от'} ${chat.peerName} (#${message.id})`,
      );
      if (chat.historySynced) {
        await this.ingest.storeMessages(chat, [message]);
        this.emitMessage(live, chat, message);
        return;
      }

      // Новый для нас диалог: истории ещё нет, первое сообщение неизвестно —
      // забираем её целиком, но один раз, даже если сообщения сыплются пачкой.
      if (binding.pendingDialogs.has(chat.peerId)) return;
      binding.pendingDialogs.add(chat.peerId);
      try {
        await this.sync.syncDialog(live.id, live.client, user, chat);
      } finally {
        binding.pendingDialogs.delete(chat.peerId);
      }
      this.emitMessage(live, chat, message);
    } catch (error) {
      await binding.hooks.fail(live, error, 'обработка сообщения');
    }
  }

  /**
   * Сырые апдейты, которые teleproto не заворачивает в события:
   * - UpdateReadHistoryOutbox — собеседник прочитал наши сообщения до max_id;
   * - UpdateUserTyping — собеседник печатает (в базу не пишем, только шина).
   */
  private async onRawUpdate(binding: Binding, update: Api.TypeUpdate): Promise<void> {
    const { live } = binding;
    if (live.stopped) return;
    try {
      if (update instanceof Tl.UpdateUserTyping) {
        this.events.emit({
          kind: 'typing',
          accountId: live.id,
          userId: live.userId,
          peerId: update.userId.toString(),
        });
        return;
      }
      if (update instanceof Tl.UpdateReadHistoryOutbox) {
        if (!(update.peer instanceof Tl.PeerUser)) return;
        const chat = await this.chats.findByPeer(live.id, update.peer.userId.toString());
        if (!chat) return;
        const changed = await this.ingest.applyReadOutbox(chat, update.maxId);
        if (!changed) return;
        this.logger.debug(`Аккаунт ${live.label}: ${chat.peerName} прочитал до #${update.maxId}`);
        this.events.emit({
          kind: 'read',
          accountId: live.id,
          userId: live.userId,
          chat,
          maxId: update.maxId,
        });
      }
    } catch (error) {
      this.logger.warn(`Аккаунт ${live.label}: сырой апдейт не обработан — ${describeError(error)}`);
    }
  }

  private emitMessage(live: LiveAccount, chat: TelegramChatEntity, message: Api.Message): void {
    this.events.emit({
      kind: 'message',
      accountId: live.id,
      userId: live.userId,
      chat,
      message,
      direction: messageDirection(message),
    });
  }

  /**
   * Личные сообщения приходят как updateShortMessage — без данных о
   * собеседнике. `event.getChat()` берёт пользователя из кэша сущностей,
   * который живёт в памяти и наполняется ответами getDialogs/getMessages.
   * Для нового собеседника или сразу после перезапуска кэш пуст — тогда
   * подтягиваем свежие диалоги: их ответ содержит пользователей с access hash.
   * Несколько сообщений подряд от одного неизвестного собеседника ждут один
   * и тот же запрос, а не плодят свои.
   */
  private async resolvePeerUser(
    binding: Binding,
    peerId: string,
    event: NewMessageEvent,
  ): Promise<Api.User | 'skip' | null> {
    const cached = classify(await event.getChat().catch(() => undefined));
    if (cached !== null) return cached;

    let pending = binding.resolving.get(peerId);
    if (!pending) {
      pending = (async () => {
        const dialogs = await binding.live.client.getDialogs({ limit: RESOLVE_DIALOGS_LIMIT });
        for (const dialog of dialogs) {
          const user = asUser(dialog.entity);
          if (user && user.id.toString() === peerId) return classify(user);
        }
        return null;
      })().finally(() => binding.resolving.delete(peerId));
      binding.resolving.set(peerId, pending);
    }
    return pending;
  }
}

/** Человек-собеседник, 'skip' для ботов и служебных, null — не пользователь вовсе. */
function classify(entity: unknown): Api.User | 'skip' | null {
  const user = asUser(entity);
  if (!user) return null;
  return isNonHumanUser(user) ? 'skip' : user;
}
