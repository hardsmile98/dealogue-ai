import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import teleproto from 'teleproto';
import type { Api, TelegramClient } from 'teleproto';
import { Repository } from 'typeorm';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { TelegramChatEntity } from '../../telegram/entities/telegram-chat.entity.js';
import { describeError, isAuthLost, isFloodWait } from '../../telegram/lib/telegram-errors.js';
import { TelegramIngestService, onlyMessages } from '../../telegram/services/telegram-ingest.service.js';
import { TelegramRuntimeService } from '../../telegram/services/telegram-runtime.service.js';
import { privateUserOf } from '../../telegram/services/telegram-sync.service.js';
import { AiConfig } from '../ai.config.js';
import { AiJobWorker } from '../services/ai-job-worker.service.js';
import type { JobContext, JobOutcome } from '../services/ai-job-worker.service.js';
import { AiJobsService } from '../services/ai-jobs.service.js';
import { ExchangeIndexerService } from './exchange-indexer.service.js';

const { Api: Tl } = teleproto;

const PAGE_SIZE = 100;
const PAGE_PAUSE_MS = [300, 700];
const DIALOGS_WARMUP_LIMIT = 500;
const OFFLINE_RETRY_MS = 5 * 60_000;

export interface ImportProgress {
  chatsTotal: number;
  chatsDone: number;
  messages: number;
}

/**
 * Глубокая выгрузка всей истории личных диалогов аккаунта — для обучения.
 * Идёт бережно (пауза между страницами, FLOOD_WAIT переносит job), пишет
 * прогресс в job и в аккаунт, после рестарта продолжает с недовыгруженных чатов.
 */
@Injectable()
export class HistoryImportService implements OnModuleInit {
  private readonly logger = new Logger(HistoryImportService.name);

  constructor(
    private readonly config: AiConfig,
    private readonly worker: AiJobWorker,
    private readonly jobs: AiJobsService,
    private readonly runtime: TelegramRuntimeService,
    private readonly ingest: TelegramIngestService,
    private readonly indexer: ExchangeIndexerService,
    private readonly realtime: RealtimeService,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
  ) {}

  onModuleInit(): void {
    this.worker.register('import', (ctx) => this.handle(ctx));
  }

  /** Поставить импорт в очередь (кнопка «Загрузить всю историю»). */
  async start(accountId: string): Promise<void> {
    await this.accounts.update(accountId, { deepHistoryStatus: 'running' });
    await this.jobs.enqueue({ type: 'import', accountId, runAt: new Date(), maxAttempts: 20 });
    this.worker.kick();
  }

  private async handle(ctx: JobContext): Promise<JobOutcome> {
    const { accountId } = ctx.job;
    const client = this.runtime.getClient(accountId);
    if (!client) {
      return { kind: 'postpone', runAt: new Date(Date.now() + OFFLINE_RETRY_MS), reason: 'аккаунт не подключён', payload: { offline: true } };
    }

    const progress: ImportProgress = {
      chatsTotal: 0,
      chatsDone: 0,
      messages: Number((ctx.job.payload.progress as ImportProgress | undefined)?.messages ?? 0),
    };

    try {
      // Прогрев: свежие диалоги дают access hash всем собеседникам и создают недостающие чаты.
      await this.warmUp(accountId, client);

      const pending = await this.chats.find({
        where: { accountId, deepHistorySynced: false },
        order: { lastMessageAt: { direction: 'DESC', nulls: 'LAST' } },
      });
      const done = await this.chats.count({ where: { accountId, deepHistorySynced: true } });
      progress.chatsTotal = pending.length + done;
      progress.chatsDone = done;
      await this.report(ctx, accountId, progress, 'running');

      for (const chat of pending) {
        const alive = await ctx.heartbeat({ progress });
        if (!alive) return { kind: 'cancelled' };
        progress.messages += await this.importChat(accountId, client, chat);
        progress.chatsDone += 1;
        await this.report(ctx, accountId, progress, 'running');
      }

      await this.indexer.indexAccount(accountId);
      await this.accounts.update(accountId, { deepHistoryStatus: 'done' });
      await this.report(ctx, accountId, progress, 'done');
      this.logger.log(`Аккаунт ${accountId}: история выгружена, сообщений ${progress.messages}`);
      return { kind: 'done' };
    } catch (error) {
      if (isFloodWait(error)) {
        const runAt = new Date(Date.now() + (error.seconds + 60) * 1000);
        return { kind: 'postpone', runAt, reason: `FLOOD_WAIT ${error.seconds} с` };
      }
      if (isAuthLost(error)) {
        await this.accounts.update(accountId, { deepHistoryStatus: 'error' });
        await this.report(ctx, accountId, progress, 'error', describeError(error));
        return { kind: 'postpone', runAt: new Date(Date.now() + OFFLINE_RETRY_MS), reason: 'сессия отозвана' };
      }
      await this.accounts.update(accountId, { deepHistoryStatus: 'error' });
      await this.report(ctx, accountId, progress, 'error', describeError(error));
      throw error;
    }
  }

  private async warmUp(accountId: string, client: TelegramClient): Promise<void> {
    for await (const dialog of client.iterDialogs({ limit: DIALOGS_WARMUP_LIMIT })) {
      const user = privateUserOf(dialog);
      if (!user) continue;
      await this.ingest.upsertChat(accountId, user);
    }
  }

  /** Все сообщения чата от новых к старым до конца или до предела возраста. */
  private async importChat(accountId: string, client: TelegramClient, chat: TelegramChatEntity): Promise<number> {
    const cutoff = Date.now() - this.config.importMaxAgeDays * 86_400_000;
    const peer = await this.resolvePeer(client, chat);
    if (!peer) {
      this.logger.warn(`Чат ${chat.id}: собеседник не резолвится, пропускаем`);
      await this.chats.update(chat.id, { deepHistorySynced: true });
      return 0;
    }

    let offsetId = 0;
    let imported = 0;
    let oldest: Api.Message | null = null;
    let reachedStart = false;

    for (;;) {
      const page = await client.getMessages(peer, { limit: PAGE_SIZE, offsetId });
      const messages = onlyMessages(page);
      if (page.length === 0) {
        reachedStart = true;
        break;
      }
      const inRange = messages.filter((m) => m.date * 1000 >= cutoff);
      if (inRange.length > 0) {
        await this.ingest.storeMessages(chat, inRange, { total: page.total });
        imported += inRange.length;
        oldest = inRange[inRange.length - 1];
      }
      if (inRange.length < messages.length) break; // дошли до предела возраста
      offsetId = page[page.length - 1].id;
      if (page.length < PAGE_SIZE) {
        reachedStart = true;
        break;
      }
      await sleep(PAGE_PAUSE_MS[0] + Math.random() * (PAGE_PAUSE_MS[1] - PAGE_PAUSE_MS[0]));
    }

    if (reachedStart && oldest && !chat.historySynced) {
      await this.ingest.refreshAggregates(chat, { firstMessage: oldest });
    }
    await this.chats.update(chat.id, { deepHistorySynced: true });
    return imported;
  }

  private async resolvePeer(client: TelegramClient, chat: TelegramChatEntity): Promise<Api.TypeInputPeer | null> {
    try {
      return await client.getInputEntity(chat.peerId);
    } catch {
      for (const handle of [chat.peerUsername ? `@${chat.peerUsername}` : null, chat.peerPhone].filter(Boolean)) {
        try {
          return await client.getInputEntity(handle as string);
        } catch {
          // пробуем следующий вариант
        }
      }
      if (!chat.peerAccessHash) return null;
      return new Tl.InputPeerUser({
        userId: teleproto.helpers.returnBigInt(chat.peerId),
        accessHash: teleproto.helpers.returnBigInt(chat.peerAccessHash),
      });
    }
  }

  private async report(
    ctx: JobContext,
    accountId: string,
    progress: ImportProgress,
    status: 'running' | 'done' | 'error',
    error?: string,
  ): Promise<void> {
    await ctx.heartbeat({ progress }).catch(() => undefined);
    await this.realtime.publishForAccount(accountId, {
      type: 'learning.progress',
      accountId,
      job: 'import',
      status,
      done: progress.chatsDone,
      total: progress.chatsTotal,
      error,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
