import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '../../common/errors.js';
import { AnalysisParseError, parseAnalysis } from '../core/analysis.js';
import type { Clock } from '../core/channel.js';
import type { Analysis, Draft, Review } from '../core/types.js';
import { WriterParseError, parseWriterOutput } from '../core/writer-output.js';
import type { PromptKind } from '../entities/bot-prompt-snapshot.entity.js';
import { LlmError } from '../llm/llm.types.js';
import type { LlmClient, LlmMessage, LlmRequest } from '../llm/llm.types.js';
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

/** Чем и в рамках какого хода идёт обращение к модели. */
export interface LlmCallContext {
  llm: LlmClient;
  turnId: string;
  model: string;
  /** Паузы между повторами — по часам хода (в песочнице они виртуальные). */
  clock: Clock;
}

/**
 * Три обращения хода к модели — анализатор (t=0), ответчик (t=0.7),
 * проверяющий (t=0), все в JSON-режиме (docs/agent-architecture.md, 3.3–3.6).
 *
 * Каждое пишет в журнал снимок промпта и ответа. Временная ошибка модели
 * (сеть, 429, 5xx, таймаут) повторяется дважды с паузой 2 и 5 с; ответ,
 * который не разобрался как JSON, запрашивается ещё раз — один раз.
 */
@Injectable()
export class TurnLlmService {
  private readonly logger = new Logger(TurnLlmService.name);

  constructor(private readonly turns: BotTurnsRepository) {}

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
        temperature: 0.7,
        json: true,
      },
      parseWriterOutput,
    );
  }

  /** Пустой черновик без вехи — грубое нарушение без обращения к модели. */
  async review(
    call: LlmCallContext,
    input: ReviewerPromptInput,
  ): Promise<Review> {
    if (
      input.parts.length + input.after.length === 0 &&
      !input.plan.milestone
    ) {
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
  ): Promise<string> {
    const snapshot = request.messages
      .map((message) => `### ${message.role}\n${message.content}`)
      .join('\n\n');
    for (let attempt = 0; ; attempt += 1) {
      let text: string;
      try {
        text = (await call.llm.complete(request)).text;
      } catch (error) {
        const retryable = error instanceof LlmError ? error.retryable : true;
        const delay = LLM_RETRY_DELAYS_MS[attempt];
        if (!retryable || delay === undefined) {
          await this.turns.addSnapshot(
            call.turnId,
            step,
            snapshot,
            `ОШИБКА: ${errorMessage(error)}`,
          );
          throw error;
        }
        await call.clock.sleep(delay);
        continue;
      }
      await this.turns.addSnapshot(call.turnId, step, snapshot, text);
      return text;
    }
  }
}
