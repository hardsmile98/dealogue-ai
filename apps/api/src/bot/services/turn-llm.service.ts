import { Injectable, Logger } from '@nestjs/common';
import { Semaphore } from '../../common/async.js';
import { errorMessage } from '../../common/errors.js';
import { BotConfig } from '../bot.config.js';
import { AnalysisParseError, parseAnalysis } from '../core/analysis.js';
import { throwIfInterrupted } from '../core/channel.js';
import type { Clock } from '../core/channel.js';
import type { PersonalizationEdit } from '../core/personalize.js';
import type { Analysis, Draft, Review } from '../core/types.js';
import { WriterParseError, parseWriterOutput } from '../core/writer-output.js';
import type { PromptKind } from '../entities/bot-prompt-snapshot.entity.js';
import { LlmError } from '../llm/llm.types.js';
import type { LlmClient, LlmMessage, LlmRequest } from '../llm/llm.types.js';
import {
  buildPersonalizerPrompt,
  parsePersonalization,
} from '../prompts/personalizer.prompt.js';
import type { PersonalizerPromptInput } from '../prompts/personalizer.prompt.js';
import {
  buildReviewerPrompt,
  parseReview,
} from '../prompts/reviewer.prompt.js';
import type { ReviewerPromptInput } from '../prompts/reviewer.prompt.js';
import { buildWriterPrompt } from '../prompts/writer.prompt.js';
import type { WriterPromptInput } from '../prompts/writer.prompt.js';
import { BotTurnsRepository } from '../repositories/bot-turns.repository.js';

/** Паузы перед повторами обращения к модели при временной ошибке (сеть, 429, 5xx, таймаут). */
const LLM_RETRY_DELAYS_MS = [2_000, 5_000];

/**
 * Подстройка диагностики пишет правки нескольких абзацев длинного текста —
 * дольше обычного ответа. Повторов нет: не вышло — диагностика уходит как
 * в библиотеке, клиент не ждёт лишние минуты.
 */
const PERSONALIZER_TIMEOUT_MS = 90_000;
const PERSONALIZER_MAX_TOKENS = 4_096;
const PERSONALIZER_TEMPERATURE = 0.7;

/** Чем и в рамках какого хода идёт обращение к модели. */
export interface LlmCallContext {
  llm: LlmClient;
  turnId: string;
  model: string;
  /** Паузы между повторами — по часам хода (в песочнице они виртуальные). */
  clock: Clock;
  /** Остановка API: обращение и паузы между повторами обрываются (`TurnInterrupted`). */
  signal?: AbortSignal;
}

/**
 * Обращения хода к модели — анализатор (t=0), ответчик (t=0.5),
 * проверяющий (t=0) и, когда уходит диагностика, её подстройка под клиента
 * (t=0.7), все в JSON-режиме (docs/agent-architecture.md, 3.3–3.7).
 *
 * Каждое пишет в журнал снимок промпта и ответа. Временная ошибка модели
 * (сеть, 429, 5xx, таймаут) повторяется дважды с паузой 2 и 5 с; ответ,
 * который не разобрался как JSON, запрашивается ещё раз — один раз.
 * Одновременно идёт не больше `BOT_LLM_CONCURRENCY` обращений на процесс:
 * после перезапуска с десятками неотвеченных чатов модель не заваливается
 * запросами, а поллер может держать много ходов, которые ждут паузу.
 */
@Injectable()
export class TurnLlmService {
  private readonly logger = new Logger(TurnLlmService.name);
  private readonly gate: Semaphore;

  constructor(
    private readonly turns: BotTurnsRepository,
    config: BotConfig,
  ) {
    this.gate = new Semaphore(config.llmConcurrency);
  }

  analyze(
    call: LlmCallContext,
    messages: LlmMessage[],
    sourceMessageId: number | null,
  ): Promise<Analysis> {
    return this.completeParsed(
      call,
      'analyzer',
      { model: call.model, messages, temperature: 0, json: true },
      (raw) => parseAnalysis(raw, sourceMessageId),
    );
  }

  write(call: LlmCallContext, input: WriterPromptInput): Promise<Draft> {
    return this.completeParsed(
      call,
      'writer',
      {
        model: call.model,
        messages: buildWriterPrompt(input),
        temperature: 0.5,
        json: true,
      },
      parseWriterOutput,
    );
  }

  /** Пустой черновик — грубое нарушение без обращения к модели: ответчика зовут, только когда есть что написать. */
  async review(
    call: LlmCallContext,
    input: ReviewerPromptInput,
  ): Promise<Review> {
    if (input.parts.length === 0) {
      return {
        violations: [
          {
            code: 'unanswered_point',
            severity: 'hard',
            detail: 'ответчик не вернул текст',
          },
        ],
      };
    }
    const raw = await this.complete(call, 'reviewer', {
      model: call.model,
      messages: buildReviewerPrompt(input),
      temperature: 0,
      json: true,
    });
    return parseReview(raw);
  }

  /**
   * Правки диагностики под клиента (core/personalize.ts). Одна попытка:
   * ошибка уходит вызывающему, и он отправляет текст из библиотеки.
   */
  async personalize(
    call: LlmCallContext,
    input: PersonalizerPromptInput,
  ): Promise<PersonalizationEdit[]> {
    const raw = await this.complete(
      call,
      'personalizer',
      {
        model: call.model,
        messages: buildPersonalizerPrompt(input),
        temperature: PERSONALIZER_TEMPERATURE,
        json: true,
        maxTokens: PERSONALIZER_MAX_TOKENS,
        timeoutMs: PERSONALIZER_TIMEOUT_MS,
      },
      [],
    );
    return parsePersonalization(raw);
  }

  /** Обращение с разбором ответа: ответ, который не разобрался, запрашивается ещё раз (один раз). */
  private async completeParsed<T>(
    call: LlmCallContext,
    step: PromptKind,
    request: LlmRequest,
    parse: (raw: string) => T,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      const raw = await this.complete(call, step, request);
      try {
        return parse(raw);
      } catch (error) {
        const malformed =
          error instanceof AnalysisParseError ||
          error instanceof WriterParseError;
        if (!malformed || attempt >= 2) throw error;
        this.logger.warn(
          `Ход ${call.turnId}: ${step} вернул неразборчивый ответ, повтор`,
        );
      }
    }
  }

  /**
   * Обращение к модели со снимком в журнал и повторами с паузой при
   * временной ошибке. Повторяется только обращение к модели: сбой записи
   * снимка в базу — ошибка хода, а не повод платить за ещё один вызов.
   */
  private async complete(
    call: LlmCallContext,
    step: PromptKind,
    request: LlmRequest,
    retryDelays: readonly number[] = LLM_RETRY_DELAYS_MS,
  ): Promise<string> {
    const snapshot = request.messages
      .map((message) => `### ${message.role}\n${message.content}`)
      .join('\n\n');
    for (let attempt = 0; ; attempt += 1) {
      throwIfInterrupted(call.signal);
      let text: string;
      try {
        text = (
          await this.gate.run(
            () => call.llm.complete({ ...request, signal: call.signal }),
            call.signal,
          )
        ).text;
      } catch (error) {
        // Остановка API — не ошибка модели: без снимка и без повторов.
        throwIfInterrupted(call.signal);
        const retryable = error instanceof LlmError ? error.retryable : true;
        const delay = retryDelays[attempt];
        if (!retryable || delay === undefined) {
          await this.turns.addSnapshot(
            call.turnId,
            step,
            snapshot,
            `ОШИБКА: ${errorMessage(error)}`,
          );
          throw error;
        }
        await call.clock.sleep(delay, call.signal);
        continue;
      }
      await this.turns.addSnapshot(call.turnId, step, snapshot, text);
      return text;
    }
  }
}
