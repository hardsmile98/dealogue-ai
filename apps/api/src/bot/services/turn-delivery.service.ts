import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { errorMessage } from '../../common/errors.js';
import { TurnInterrupted } from '../core/channel.js';
import { deliver } from '../core/delivery.js';
import type { DelayPlan } from '../core/delivery.js';
import { HISTORY_LIMIT } from '../core/history.js';
import { resumePoint } from '../core/resume.js';
import type { DeliveryRecord } from '../core/resume.js';
import { nextRetry } from '../core/retry.js';
import { saidEntries } from '../core/said.js';
import type {
  Plan,
  RetryState,
  SentPart,
  TurnJob,
  TurnResult,
} from '../core/types.js';
import type { BotTurnEntity } from '../entities/bot-turn.entity.js';
import { HANDOFF_LABELS } from '../library/kinds.js';
import type { HandoffReason, Stage } from '../library/kinds.js';
import { BotChatStateRepository } from '../repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../repositories/bot-jobs.repository.js';
import { BotMemoryRepository } from '../repositories/bot-memory.repository.js';
import { BotTurnsRepository } from '../repositories/bot-turns.repository.js';
import { BotLadderService } from './bot-ladder.service.js';
import type { TurnEnvironment } from './turn-runner.service.js';

/** Ход с собранным текстом — всё, что нужно, чтобы доставить и закрыть его, в том числе после перезапуска. */
export interface CommittedTurn {
  turnId: string;
  chatId: string;
  /** Последнее сообщение клиента, на которое отвечает ход; у хода по расписанию null. */
  lastMessageId: number | null;
  job: TurnJob | null;
  plan: Plan;
  delivery: DeliveryRecord;
}

/** Итог доставки: `closed` — ход закрыт; иначе ждёт досылки заданием `resume`. */
export interface DeliveryOutcome {
  result: TurnResult;
  closed: boolean;
}

/** Повтор досылки конкретного хода — из задания `resume`. */
export interface ResumeRetry {
  turnId: string;
  retry: RetryState;
}

/**
 * Вторая половина хода — после точки фиксации (core/resume.ts): доставка
 * по частям с записью прогресса, закрытие одной транзакцией и досылка
 * прерванного. Собранный ход всегда доводится до конца доставкой, а не
 * собирается заново: после остановки API или сбоя отправки он досылается
 * с того же места, а если разговор ушёл вперёд — закрывается с тем, что
 * успело уйти, и ушедшее попадает в реестр сказанного.
 */
@Injectable()
export class TurnDeliveryService {
  private readonly logger = new Logger(TurnDeliveryService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly states: BotChatStateRepository,
    private readonly memories: BotMemoryRepository,
    private readonly turns: BotTurnsRepository,
    private readonly jobs: BotJobsRepository,
    private readonly ladder: BotLadderService,
  ) {}

  /** Точка фиксации: с этого момента ход досылается, а не повторяется. */
  async commit(turn: CommittedTurn): Promise<void> {
    await this.turns.update(turn.turnId, {
      delivery: turn.delivery as unknown as Record<string, unknown>,
    });
  }

  /**
   * Доставка с `sent` (уже ушедшее) и закрытие хода. Сбой отправки не
   * выбрасывается: ход ждёт досылки с паузой, а когда окно повторов
   * вышло — закрывается и уходит менеджеру. Остановка API
   * (`TurnInterrupted`) выбрасывается: ход останется как есть до старта.
   */
  async deliver(
    turn: CommittedTurn,
    from: { sent: SentPart[]; delays: DelayPlan },
    env: TurnEnvironment,
    signal: AbortSignal,
    retry?: RetryState,
  ): Promise<DeliveryOutcome> {
    const { delivery } = turn;
    let progress: readonly SentPart[] = from.sent;
    try {
      const { sent, aborted } = await deliver(
        {
          chatId: turn.chatId,
          parts: delivery.parts,
          delays: from.delays,
          markRead: delivery.markRead,
          isStale: env.isStale,
          sent: from.sent,
          signal,
          onSending: (index) =>
            this.turns.update(turn.turnId, {
              delivery: record({ ...delivery, sending: index }),
            }),
          onSent: async (sent) => {
            progress = [...sent];
            await this.turns.update(turn.turnId, {
              delivery: record({ ...delivery, sending: null }),
              sent: { parts: sent, aborted: false },
            });
          },
        },
        env.channel,
        env.clock,
      );
      return {
        result: await this.finish(turn, sent, aborted, env),
        closed: true,
      };
    } catch (error) {
      if (error instanceof TurnInterrupted) throw error;
      return this.failed(turn, [...progress], error, retry, env);
    }
  }

  /**
   * Доводит до конца собранные, но не закрытые ходы чата — прерванные
   * остановкой API или ждущие досылки после сбоя. Вызывается под замком
   * чата перед новым ходом и заданием `resume`: новый ход должен знать,
   * что из прошлого уже ушло. `clear` — в чате не осталось незакрытых.
   */
  async settle(
    chatId: string,
    env: TurnEnvironment,
    signal: AbortSignal,
    retry?: ResumeRetry,
  ): Promise<{ clear: boolean; result: TurnResult | null }> {
    const rows = await this.turns.unfinished(chatId);
    let result: TurnResult | null = null;
    for (const row of rows) {
      const outcome = await this.resume(
        row,
        env,
        signal,
        retry?.turnId === row.id ? retry.retry : undefined,
      );
      result = outcome.result;
      if (!outcome.closed) return { clear: false, result };
    }
    return { clear: true, result };
  }

  /** Передача менеджеру: режим, причина, ярлык, снятие ожидающих заданий. */
  async handoff(
    chatId: string,
    reason: HandoffReason,
    db?: EntityManager,
  ): Promise<void> {
    await this.memories.setHandoff(chatId, reason, HANDOFF_LABELS[reason], db);
    await this.jobs.cancelPending(chatId, undefined, db);
  }

  // --- внутреннее -------------------------------------------------------------

  /** Один незакрытый ход: дослать остаток или, если разговор ушёл вперёд, закрыть. */
  private async resume(
    row: BotTurnEntity,
    env: TurnEnvironment,
    signal: AbortSignal,
    retry: RetryState | undefined,
  ): Promise<DeliveryOutcome> {
    const turn = committedOf(row);
    const [history, state] = await Promise.all([
      env.channel.history(turn.chatId, HISTORY_LIMIT),
      this.states.find(turn.chatId),
    ]);
    const point = resumePoint({
      delivery: turn.delivery,
      sent: sentPartsOf(row.sent),
      history,
      now: env.clock.now(),
    });
    if (!state || state.mode !== 'auto' || point.movedOn) {
      this.logger.log(
        `Ход ${turn.turnId}: разговор ушёл вперёд — закрыт с тем, что успело уйти (${point.sent.length} из ${turn.delivery.parts.length})`,
      );
      return {
        result: await this.finish(turn, point.sent, true, env),
        closed: true,
      };
    }
    this.logger.log(
      `Ход ${turn.turnId}: досылка с части ${point.sent.length + 1} из ${turn.delivery.parts.length}`,
    );
    return this.deliver(turn, point, env, signal, retry);
  }

  /**
   * Закрытие хода одной транзакцией: реестр сказанного, счётчики, задание,
   * передача менеджеру после цен, журнал. Уже закрытый ход второй раз не
   * закрывается — повторная досылка после сбоя посреди закрытия безопасна.
   * Лестница — после, от нового состояния. С `failure` — досылка так и не
   * удалась: ход закрывается как `failed`, чат уходит менеджеру.
   */
  private async finish(
    turn: CommittedTurn,
    sent: SentPart[],
    aborted: boolean,
    env: TurnEnvironment,
    failure?: string,
  ): Promise<TurnResult> {
    const { plan, delivery } = turn;
    const said = saidEntries({
      plan,
      writerArguments: delivery.writerArguments,
      parts: delivery.parts,
      sent,
      fallback: delivery.fallback,
    });
    // Шаг воронки сделан, если ушло подталкивание или веха; запасная фраза шагом не считается.
    const milestoneDelivered = said.some((entry) => entry.kind === 'milestone');
    const stage: Stage =
      milestoneDelivered && plan.milestone
        ? plan.milestone.key
        : delivery.stage;
    const status: TurnResult['status'] = failure
      ? 'failed'
      : aborted && sent.length === 0
        ? 'skipped'
        : 'sent';
    const handoff: HandoffReason | null = failure
      ? 'agent_unavailable'
      : stage === 'prices'
        ? 'prices_sent'
        : null;
    const now = env.clock.now();

    const closed = await this.dataSource.transaction(async (db) => {
      if (!(await this.turns.lockRunning(turn.turnId, db))) return false;
      await this.memories.addSaid(turn.chatId, said, now, db);
      await this.memories.closeTurn(
        turn.chatId,
        {
          nudged:
            milestoneDelivered ||
            (plan.nudge !== null &&
              plan.nudge !== 'skip' &&
              !aborted &&
              !delivery.fallback),
          reminders: aborted ? 0 : plan.reminders,
          lastHandledMessageId: turn.lastMessageId,
        },
        db,
      );
      if (turn.job && failure) {
        await this.jobs.markFailed(turn.job.id, failure, db);
      } else if (turn.job) {
        await this.jobs.markDone(turn.job.id, db);
      }
      if (handoff) await this.handoff(turn.chatId, handoff, db);
      await this.turns.update(
        turn.turnId,
        {
          status,
          sent: { parts: sent, aborted },
          delivery: record({ ...delivery, sending: null }),
          ...(failure ? { error: failure } : {}),
          finished: true,
        },
        db,
      );
      return true;
    });
    // Лестница — заново от нового состояния: ответ клиента снимает дальние
    // ступени, новая веха или подталкивание ставит следующую.
    if (closed) await this.ladder.reschedule(turn.chatId, env.channel);
    return {
      turnId: turn.turnId,
      status,
      stage,
      sent,
      handoff,
      ...(failure ? { error: failure } : {}),
    };
  }

  /**
   * Сбой отправки. Ход не собирается заново: записанное ушедшее остаётся,
   * остаток досылается заданием `resume` с нарастающей паузой. Когда окно
   * повторов вышло — ход закрывается с тем, что успело уйти, и чат уходит
   * менеджеру с ярлыком «агент недоступен».
   */
  private async failed(
    turn: CommittedTurn,
    sent: SentPart[],
    error: unknown,
    retry: RetryState | undefined,
    env: TurnEnvironment,
  ): Promise<DeliveryOutcome> {
    const message = errorMessage(error);
    this.logger.error(
      `Ход ${turn.turnId} в чате ${turn.chatId}: доставка не удалась — ${message}`,
    );
    const failure: TurnResult = {
      turnId: turn.turnId,
      status: 'failed',
      stage: turn.delivery.stage,
      sent,
      handoff: null,
      error: message,
    };
    try {
      const next = nextRetry(retry, env.clock.now());
      if (next) {
        await this.turns.update(turn.turnId, {
          error: message,
          sent: { parts: sent, aborted: false },
        });
        await this.jobs.scheduleResume(turn.chatId, turn.turnId, next.runAt, {
          ...next.retry,
        });
        return { result: failure, closed: false };
      }
      return {
        result: await this.finish(turn, sent, true, env, message),
        closed: true,
      };
    } catch (recordError) {
      // База недоступна: ход остаётся незакрытым с записанным прогрессом —
      // его дошлёт восстановление при старте или следующий ход чата.
      this.logger.error(
        `Ход ${turn.turnId}: повтор досылки не поставлен — ${errorMessage(recordError)}`,
      );
      return { result: failure, closed: false };
    }
  }
}

function record(delivery: DeliveryRecord): Record<string, unknown> {
  return delivery as unknown as Record<string, unknown>;
}

/** Строка журнала с точкой фиксации → ход, который можно доставить и закрыть. */
function committedOf(row: BotTurnEntity): CommittedTurn {
  const input = row.input as {
    messages?: { id: number }[];
    job?: TurnJob | null;
  };
  return {
    turnId: row.id,
    chatId: row.chatId,
    lastMessageId: input.messages?.at(-1)?.id ?? null,
    job: input.job ?? null,
    plan: row.plan as unknown as Plan,
    delivery: row.delivery as unknown as DeliveryRecord,
  };
}

/** Записанный прогресс доставки; время из JSON — снова Date. */
function sentPartsOf(sent: Record<string, unknown> | null): SentPart[] {
  const parts = (sent?.parts ?? []) as (Omit<SentPart, 'sentAt'> & {
    sentAt: string | Date;
  })[];
  return parts.map((part) => ({ ...part, sentAt: new Date(part.sentAt) }));
}
