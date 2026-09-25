import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { firstValueFrom } from 'rxjs';
import type { Subscription } from 'rxjs';
import { DataSource } from 'typeorm';
import { errorMessage } from '../../common/errors.js';
import { whenListening } from '../../common/lifecycle.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotTurnsRepository } from '../repositories/bot-turns.repository.js';
import type { OrphanTurn } from '../repositories/bot-turns.repository.js';
import { BotLadderService } from './bot-ladder.service.js';
import { BotTelegramChannels } from './bot-telegram-channels.service.js';

const INTERRUPTED_REASON =
  'API остановился раньше, чем текст был собран; ход повторён заново';

/**
 * Восстановление агента после остановки API — один раз за жизнь процесса,
 * когда HTTP-сервер занял порт, и до первого хода (ходы ждут `ready()`).
 * Всё, что осталось `running` от прошлого процесса, принадлежит мёртвому
 * процессу: второй экземпляр на занятом порту не стартует.
 *
 * - Ход без точки фиксации ничего не отправил: он помечается `interrupted`
 *   (ключ идемпотентности свободен) и повторяется целиком — его задание
 *   снова в очереди, ход клиента повторяет задание `reply`.
 * - Ход с точкой фиксации досылается заданием `resume` с того места, где
 *   остановился (TurnDeliveryService); его задание закроет досылка.
 * - Остальные задания `running` — снова в очередь, сразу, а не через
 *   таймаут.
 * - Лестница молчания пересчитывается у всех чатов под агентом: ход,
 *   прерванный посреди закрытия, мог не поставить следующую ступень.
 *
 * Песочница не досылается: её прерванные ходы помечаются `interrupted`,
 * ответ повторяется кнопкой в вебе. В процессе без HTTP-сервера (скрипты
 * из scripts/) восстановления нет — его ходы `running` принадлежат живому API.
 */
@Injectable()
export class BotRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotRecoveryService.name);
  private sweeping: Promise<void> | null = null;
  private listening: Subscription | null = null;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly dataSource: DataSource,
    private readonly turns: BotTurnsRepository,
    private readonly jobs: BotJobsRepository,
    private readonly states: BotChatStateRepository,
    private readonly ladder: BotLadderService,
    private readonly channels: BotTelegramChannels,
  ) {}

  onModuleInit(): void {
    if (!this.isServer()) return;
    this.listening = whenListening(
      this.adapterHost,
      this.logger,
      'Восстановление агента',
      () => this.ready(),
    );
  }

  onModuleDestroy(): void {
    this.listening?.unsubscribe();
  }

  /**
   * Дождаться восстановления. Если оно не удалось (база недоступна),
   * следующий вызов попробует снова.
   */
  ready(): Promise<void> {
    if (!this.isServer()) return Promise.resolve();
    if (!this.adapterHost.listening) {
      return firstValueFrom(this.adapterHost.listen$).then(() => this.ready());
    }
    this.sweeping ??= this.sweep().catch((error: unknown) => {
      this.sweeping = null;
      throw error;
    });
    return this.sweeping;
  }

  private isServer(): boolean {
    return this.adapterHost.httpAdapter !== undefined;
  }

  private async sweep(): Promise<void> {
    const now = new Date();
    const summary = await this.dataSource.transaction(async (db) => {
      const orphans = await this.turns.orphans(db);
      const resumable = orphans.filter(
        (turn) => turn.committed && !turn.sandbox,
      );
      const restarted = orphans.filter(
        (turn) => !turn.committed || turn.sandbox,
      );

      const released = await this.jobs.releaseOrphans(
        resumable.flatMap((turn) => jobIdOf(turn) ?? []),
        db,
      );
      await this.turns.markInterrupted(
        restarted.map((turn) => turn.id),
        INTERRUPTED_REASON,
        db,
      );
      for (const turn of resumable) {
        await this.jobs.scheduleResume(turn.chatId, turn.id, now, null, db);
      }
      // Ход клиента без задания повторяется заданием `reply`: оно заново
      // соберёт неотвеченные сообщения. Ход по заданию повторит само задание.
      await this.jobs.scheduleReplies(
        restarted
          .filter(
            (turn) =>
              !turn.sandbox && turn.trigger === 'client' && !jobIdOf(turn),
          )
          .map((turn) => turn.chatId),
        now,
        db,
      );
      return {
        resumed: resumable.length,
        restarted: restarted.length,
        released,
      };
    });
    if (summary.resumed + summary.restarted + summary.released > 0) {
      this.logger.warn(
        `После остановки API: ходов к досылке — ${summary.resumed}, к повтору — ${summary.restarted}, заданий снова в очереди — ${summary.released}`,
      );
    }
    await this.rescheduleLadders();
  }

  /** Лестница каждого чата под агентом — заново от текущего состояния. */
  private async rescheduleLadders(): Promise<void> {
    for (const { chatId, accountId } of await this.states.activeChats()) {
      try {
        await this.ladder.reschedule(
          chatId,
          this.channels.forAccount(accountId),
        );
      } catch (error) {
        this.logger.warn(
          `Лестница чата ${chatId} не пересчитана: ${errorMessage(error)}`,
        );
      }
    }
  }
}

/** Задание, из которого шёл ход (`input.job.id`), или null. */
function jobIdOf(turn: OrphanTurn): string | null {
  const job = turn.input.job as { id?: unknown } | null | undefined;
  return typeof job?.id === 'string' ? job.id : null;
}
