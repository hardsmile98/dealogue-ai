/**
 * Карточка в ходе агента: что берём из состояния в промпт и что пишем
 * обратно после ответа модели. Чистые функции — состояние на вход,
 * патч на выход; запись делает ChatStateService.
 *
 * Это единственное место, где ответ Composer превращается в слоты:
 * поля карточки код больше ниоткуда не выводит.
 */

import { CARD_FIELDS } from '../../domain/types.js';
import type { CardField, ClientCard } from '../../domain/types.js';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import type { SlotsSnapshot } from '../agent.types.js';
import type { ComposerOutput } from '../composer/composer.schema.js';
import { ageFrom, cardFromColumns, cardToColumns, mergeCard, normalizeCard } from './client-card.js';
import type { CardChange, CardProposal } from './client-card.js';

const DEFAULT_LANGUAGE = 'ru';

export interface TurnCardContext {
  now: Date;
  turnId?: string | null;
  /** Язык аккаунта: к нему возвращаемся, если язык клиента стёрли. */
  defaultLanguage?: string;
}

/** Карточка чата. Состояние старше карточки — собираем её из колонок. */
export function clientCard(state: AiChatStateEntity, defaultLanguage = DEFAULT_LANGUAGE, now = new Date()): ClientCard {
  const raw: unknown = state.card;
  const empty = !raw || typeof raw !== 'object' || Object.keys(raw as object).length === 0;
  return empty ? cardFromColumns(state, defaultLanguage, now) : normalizeCard(raw, defaultLanguage, now);
}

/** Плоский вид карточки для Planner и подбора библиотеки. */
export function slotsOf(card: ClientCard, manualSlots: string[], now = new Date()): SlotsSnapshot {
  return {
    birthDate: card.birthDate,
    birthDateText: card.birthDateText,
    birthPlace: card.birthPlace,
    age: card.birthDate ? ageFrom(card.birthDate, now) : null,
    gender: card.gender,
    language: card.language,
    requestCategoryKey: card.requestCategoryKey,
    requestSummary: card.requestSummary,
    manualSlots,
  };
}

export interface MergedCard {
  card: ClientCard;
  changes: CardChange[];
}

/**
 * Карточка из ответа модели. Чистая функция: её зовёт TurnGeneration сразу
 * после модели, до подстановки блоков, — чтобы блок и диагностика выбирались
 * уже по тому, что модель поняла в этом ходе, а не по вчерашним данным.
 */
export function mergeFromOutput(
  current: ClientCard,
  manualSlots: string[],
  output: ComposerOutput,
  ctx: TurnCardContext,
): MergedCard {
  const defaultLanguage = ctx.defaultLanguage ?? DEFAULT_LANGUAGE;
  return mergeCard(current, toProposal(output.analysis.card), {
    now: ctx.now,
    turnId: ctx.turnId ?? null,
    manualSlots,
    defaultLanguage,
  });
}

/** Карточка и колонки-слоты одним патчем состояния. */
export function cardPatch(card: ClientCard, now: Date): Partial<AiChatStateEntity> {
  return { card, ...cardToColumns(card, now) };
}

/** Основания приходят списком пар, а сливаются картой поле → цитата. */
function toProposal(raw: ComposerOutput['analysis']['card']): CardProposal {
  const evidence: Partial<Record<CardField, string>> = {};
  for (const item of raw.evidence ?? []) {
    if ((CARD_FIELDS as readonly string[]).includes(item.field)) evidence[item.field as CardField] = item.quote;
  }
  return { ...raw, evidence };
}
