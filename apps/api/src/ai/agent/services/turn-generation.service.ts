import { Injectable } from '@nestjs/common';
import type { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import type { FunnelStage } from '../../domain/types.js';
import type { AiAccountSettingsEntity } from '../../entities/ai-account-settings.entity.js';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import type { ClientCard } from '../../domain/types.js';
import type { BlockPool, ComposedMessage, GuardNote, HistoryMessage, LibraryBlock, SlotsSnapshot, TurnTask } from '../agent.types.js';
import type { ComposerOutput } from '../composer/composer.schema.js';
import { ComposerService } from '../composer/composer.service.js';
import { buildSystemPrompt, buildTurnPrompt } from '../composer/prompt-builder.js';
import type { SystemPromptInput, TurnPromptInput } from '../composer/prompt-builder.js';
import { expandMarkers, joinMessages, resolveBlocks } from '../guard/blocks.js';
import { buildAllowlists, describeViolations, runGuard } from '../guard/guard.js';
import type { GuardInput } from '../guard/guard.js';
import { formatSimilarCases } from '../learning/similar-cases.js';
import { mergeFromOutput } from '../card/turn-card.js';
import type { CardChange } from '../card/client-card.js';
import { stopReason } from '../planner/stop-reason.js';
import type { StopVerdict } from '../planner/stop-reason.js';
import { SimilarCasesService } from './similar-cases.service.js';
import { chooseBlocks, targetOf } from '../library/targeting.js';
import type { TurnContext } from './turn-context.service.js';

export interface GenerateParams {
  system: SystemPromptInput;
  turn: Omit<TurnPromptInput, 'guardRemark' | 'previousReply'>;
  guard: Omit<GuardInput, 'messages' | 'unknownBlockKinds' | 'requiredBlockKinds' | 'allowedBlockKinds' | 'noQuestions' | 'allow'>;
  task: TurnTask;
  /** Варианты блоков: конкретный выбирается уже по обновлённой карточке. */
  blockPools: BlockPool[];
  /** Факты и ссылки персоны — из них и выбранных блоков собирается белый список. */
  facts: { value: string }[];
  personaLinks: { url: string }[];
  accountLanguage: string;
}

export interface GenerateResult {
  output: ComposerOutput;
  messages: ComposedMessage[];
  /** Карточка клиента после слияния с ответом модели. */
  card: ClientCard;
  cardChanges: CardChange[];
  /** Блоки, реально попавшие в ход: выбраны по этой карточке. */
  blocks: LibraryBlock[];
  guardNotes: GuardNote[];
  /** Guard пропустил (после автоправок или регенерации). */
  guardOk: boolean;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  model: string;
  prompts: { system: string; user: string };
}

/** Из чего собирается вызов модели для конкретного чата. */
export interface TurnPromptContext {
  settings: AiAccountSettingsEntity;
  ctx: TurnContext;
  task: TurnTask;
  history: HistoryMessage[];
  batch: HistoryMessage[];
  /** Карточка клиента до этого хода и её плоский вид. */
  card: ClientCard;
  slots: SlotsSnapshot;
  /** Как клиент подписан в Telegram — модель делает по этому выводы об имени и поле. */
  peer: { name: string | null; username: string | null };
  state: AiChatStateEntity;
  similarCases?: string[];
  now: Date;
}

/** Сколько раз пробуем переписать ответ после замечаний guard'а. */
const ATTEMPTS = 2;

/**
 * Вызов модели и проверка её ответа: Composer → Guard → при нарушениях
 * регенерация с замечанием → снова Guard. Отдельно от хода, потому что тем
 * же путём ходят черновик менеджера, регенерация черновика и песочница.
 */
@Injectable()
export class TurnGenerationService {
  constructor(
    private readonly composer: ComposerService,
    private readonly similar: SimilarCasesService,
  ) {}

  /** Модель по умолчанию — для записи хода, который до вызова не дошёл. */
  get modelName(): string {
    return this.composer.modelName;
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const system = buildSystemPrompt(params.system);
    const guardNotes: GuardNote[] = [];
    let tokensIn = 0;
    let tokensOut = 0;
    let durationMs = 0;
    let model = this.composer.modelName;
    let remark: string | null = null;
    let previous: string | null = null;
    let last: { output: ComposerOutput; messages: ComposedMessage[]; card: ClientCard; changes: CardChange[]; blocks: LibraryBlock[] } | null = null;
    let user = '';

    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      user = buildTurnPrompt({ ...params.turn, guardRemark: remark, previousReply: previous });
      const result = await this.composer.compose(system, user);
      tokensIn += result.raw.usage.inputTokens;
      tokensOut += result.raw.usage.outputTokens;
      durationMs += result.durationMs;
      model = result.raw.model;

      // Карточку сливаем до подстановки блоков: диагностика и прочие блоки
      // выбираются по тому, что модель поняла в этом ходе, а не по вчерашним данным.
      const merged = mergeFromOutput(params.turn.card, params.turn.manualSlots, result.output, {
        now: params.turn.now,
        defaultLanguage: params.accountLanguage,
      });
      const blocks = chooseBlocks(params.blockPools, targetOf(merged.card, params.accountLanguage));
      const resolved = resolveBlocks(expandMarkers(result.output.reply.messages), blocks);
      const done = (messages: ComposedMessage[], guardOk: boolean): GenerateResult => ({
        output: result.output,
        messages,
        card: merged.card,
        cardChanges: merged.changes,
        blocks,
        guardNotes,
        guardOk,
        tokensIn,
        tokensOut,
        durationMs,
        model,
        prompts: { system, user },
      });

      // Модель просит остановиться или промолчать — guard не нужен.
      if (result.output.analysis.escalation || !result.output.reply.send) return done(resolved.messages, true);

      const guard = runGuard({
        ...params.guard,
        // Белый список цен и ссылок — из фактов и тех блоков, что реально уйдут.
        allow: buildAllowlists(params.facts, params.personaLinks, blocks),
        messages: resolved.messages,
        unknownBlockKinds: resolved.unknownKinds,
        requiredBlockKinds: params.task.requiredBlockKinds,
        allowedBlockKinds: params.task.allowedBlockKinds,
        noQuestions: params.task.noQuestions,
      });
      guardNotes.push({ attempt, violations: guard.violations, fixes: guard.fixes });
      last = { output: result.output, messages: guard.messages, card: merged.card, changes: merged.changes, blocks };
      if (guard.ok) return done(guard.messages, true);

      remark = describeViolations(guard.violations);
      previous = joinMessages(resolved.messages);
    }

    // Обе попытки с нарушениями: отдаём последнюю, решение — за стоп-триггерами.
    const final = last as NonNullable<typeof last>;
    return {
      output: final.output,
      messages: final.messages,
      card: final.card,
      cardChanges: final.changes,
      blocks: final.blocks,
      guardNotes,
      guardOk: false,
      tokensIn,
      tokensOut,
      durationMs,
      model,
      prompts: { system, user },
    };
  }

  /** Параметры вызова — одинаковые у хода, черновика менеджера и регенерации. */
  paramsFor(input: TurnPromptContext): GenerateParams {
    const { settings, ctx, task, history, batch, card, slots, peer, state, now } = input;
    return {
      system: { persona: settings.persona, facts: ctx.facts, stages: ctx.stages, categories: ctx.categories },
      turn: {
        task,
        playbook: ctx.playbook,
        examples: ctx.examples,
        blocks: ctx.blocks,
        history,
        batch,
        card,
        age: slots.age,
        manualSlots: slots.manualSlots,
        peer,
        notes: ctx.notes,
        similarCases: input.similarCases ?? [],
        now,
      },
      guard: {
        sentBlockIds: state.sentBlockIds,
        exhaustedBlockKinds: ctx.exhaustedBlockKinds,
        pastBotMessages: history.filter((m) => m.role === 'bot').map((m) => m.text),
        greetedToday: Boolean(state.lastGreetingAt && sameDay(state.lastGreetingAt, now)),
        config: settings.guard,
      },
      task,
      blockPools: ctx.blockPools,
      facts: ctx.facts,
      personaLinks: settings.persona.links,
      accountLanguage: ctx.accountLanguage,
    };
  }

  /**
   * Похожие прошлые случаи для промпта (раздел 9.3 ТЗ). Ищем только по тексту
   * клиента: у касания его нет, значит и подсказывать нечем.
   */
  async findSimilar(
    chat: TelegramChatEntity,
    state: AiChatStateEntity,
    stage: FunnelStage,
    batch: HistoryMessage[],
  ): Promise<{ lines: string[]; ids: string[] }> {
    if (batch.length === 0) return { lines: [], ids: [] };
    const cases = await this.similar.find({
      accountId: chat.accountId,
      chatId: chat.id,
      texts: batch.map((m) => m.text),
      stage,
      categoryKey: state.requestCategoryKey,
    });
    return { lines: formatSimilarCases(cases), ids: cases.map((c) => c.id) };
  }

  /** Стоп-триггеры по результату модели: escalation, язык, уверенность, несовершеннолетний, guard. */
  stopReason(
    state: AiChatStateEntity,
    gen: GenerateResult,
    ctx: TurnContext,
    settings: AiAccountSettingsEntity,
  ): StopVerdict | null {
    const last = gen.guardNotes[gen.guardNotes.length - 1];
    return stopReason({
      // Состояние уже несёт карточку этого хода: её применяют до стоп-триггеров.
      isMinor: state.isMinor,
      analysis: gen.output.analysis,
      language: state.language,
      libraryLanguages: ctx.libraryLanguages,
      guardOk: gen.guardOk,
      guardRemark: last ? describeViolations(last.violations) : null,
      confidenceThreshold: settings.guard.confidenceThreshold,
    });
  }
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}
