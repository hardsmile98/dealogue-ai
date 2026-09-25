import { Injectable } from '@nestjs/common';
import type { Api, TelegramClient } from 'teleproto';
import { sleep } from '../../common/async.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { onlyMessages, privateUserOf } from '../lib/telegram-objects.js';
import type { DialogLike } from '../lib/telegram-objects.js';
import { TelegramConfig } from '../telegram.config.js';
import { TelegramIngestService } from './telegram-ingest.service.js';

/** Пауза между диалогами при первичной выгрузке — чтобы не ловить FLOOD_WAIT. */
const DIALOG_PAUSE_MS = 150;
/** Сколько самых старых сообщений смотреть в поисках первого не-сервисного. */
const OLDEST_PROBE = 5;
/** Сколько сообщений догружать за раз при досинхронизации. */
const CATCH_UP_LIMIT = 200;

/**
 * Что досинхронизация нашла сверх живых событий в одном чате: сообщения и
 * прочтения за время офлайна (или пропущенные при сбое соединения).
 * Рантайм отдаёт их в шину так же, как живые события, — иначе подписчики
 * (агент, веб) о них не узнают.
 */
export interface CaughtUpChat {
  chat: TelegramChatEntity;
  /** Новые для базы сообщения по возрастанию id. */
  messages: Api.Message[];
  /** До какого id собеседник прочитал наши сообщения, если граница сдвинулась. */
  readMaxId: number | null;
}

/** Итог прохода синхронизации — для логов рантайма и событий. */
export interface SyncStats {
  /** Сколько личных диалогов просмотрено. */
  dialogs: number;
  /** Сколько из них потребовали догрузки сообщений. */
  caughtUp: number;
  /** Пропущенное живыми событиями — только у инкрементальной синхронизации. */
  missed: CaughtUpChat[];
}

/**
 * Выгрузка истории из Telegram в базу. Две стратегии:
 * - полная — при первом подключении: все личные диалоги, последние N
 *   сообщений и самое первое сообщение каждого;
 * - инкрементальная — по расписанию и после переподключения: свежие
 *   диалоги, догрузка того, что пропустили события.
 * Статус аккаунта и отметку времени пишет рантайм по итогу прохода.
 */
@Injectable()
export class TelegramSyncService {
  constructor(
    private readonly config: TelegramConfig,
    private readonly ingest: TelegramIngestService,
  ) {}

  async fullSync(
    accountId: string,
    client: TelegramClient,
  ): Promise<SyncStats> {
    let processed = 0;
    for await (const dialog of client.iterDialogs({
      limit: this.config.dialogsLimit,
    })) {
      const user = privateUserOf(dialog);
      if (!user) continue;
      await this.syncDialog(accountId, client, user);
      processed += 1;
      await sleep(DIALOG_PAUSE_MS);
    }
    // Первичная выгрузка — это история, а не события: в шину не идёт.
    return { dialogs: processed, caughtUp: processed, missed: [] };
  }

  async incrementalSync(
    accountId: string,
    client: TelegramClient,
  ): Promise<SyncStats> {
    const dialogs = await client.getDialogs({
      limit: this.config.recentDialogsLimit,
    });
    const recent: { dialog: DialogLike; user: Api.User }[] = [];
    for (const dialog of dialogs) {
      const user = privateUserOf(dialog);
      if (user) recent.push({ dialog, user });
    }
    // Все чаты свежих диалогов — парой запросов, а не по запросу на диалог.
    const chats = await this.ingest.upsertChats(
      accountId,
      recent.map(({ user }) => user),
    );

    let caughtUp = 0;
    const missed: CaughtUpChat[] = [];
    for (const { dialog, user } of recent) {
      const chat = chats.get(user.id.toString());
      if (!chat) continue;

      if (!chat.historySynced) {
        // Новый для нас диалог (например, лид написал, пока API стоял):
        // история целиком, а в шину — последнее сообщение, как у живого
        // первого сообщения нового диалога.
        await this.syncDialog(accountId, client, user, chat);
        caughtUp += 1;
        if (dialog.message) {
          missed.push({ chat, messages: [dialog.message], readMaxId: null });
        }
        continue;
      }

      // Прочтения, пропущенные за время офлайна, — из самого диалога.
      const readMax = dialog.dialog?.readOutboxMaxId ?? 0;
      const readAdvanced =
        readMax > chat.readOutboxMaxId &&
        (await this.ingest.applyReadOutbox(chat, readMax));

      let messages: Api.Message[] = [];
      const newestId = dialog.message?.id ?? 0;
      if (newestId > chat.lastTelegramMessageId) {
        const page = await client.getMessages(user, {
          minId: chat.lastTelegramMessageId,
          limit: CATCH_UP_LIMIT,
        });
        const fresh = onlyMessages(page);
        const inserted = await this.ingest.storeMessages(chat, fresh, {
          total: page.total,
        });
        const insertedIds = new Set(
          inserted.map((row) => row.telegramMessageId),
        );
        messages = fresh
          .filter((message) => insertedIds.has(message.id))
          .sort((a, b) => a.id - b.id);
        caughtUp += 1;
      }
      if (messages.length > 0 || readAdvanced) {
        missed.push({
          chat,
          messages,
          readMaxId: readAdvanced ? readMax : null,
        });
      }
    }
    return { dialogs: recent.length, caughtUp, missed };
  }

  /**
   * Один диалог: последние N сообщений плюс самое первое — для статистики.
   * Если последние N и есть вся история (типичный короткий диалог с лидом),
   * первое сообщение уже среди них и второй запрос в Telegram не нужен.
   */
  async syncDialog(
    accountId: string,
    client: TelegramClient,
    user: Api.User,
    known?: TelegramChatEntity,
  ): Promise<TelegramChatEntity> {
    const chat = known ?? (await this.ingest.upsertChat(accountId, user));
    const latest = await client.getMessages(user, {
      limit: this.config.messagesLimit,
    });
    const wholeHistory = (latest.total ?? latest.length) <= latest.length;
    const oldest = wholeHistory
      ? []
      : await client.getMessages(user, { limit: OLDEST_PROBE, reverse: true });

    const recent = onlyMessages(latest);
    // latest идёт от новых к старым, oldest — от старых к новым.
    const first =
      (wholeHistory ? recent.at(-1) : onlyMessages(oldest)[0]) ?? null;
    await this.ingest.storeMessages(
      chat,
      [...recent, ...onlyMessages(oldest)],
      {
        total: latest.total,
        firstMessage: first,
      },
    );
    return chat;
  }
}
