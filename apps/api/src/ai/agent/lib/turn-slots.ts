import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import type { ComposerOutput } from '../composer/composer.schema.js';
import type { HistoryMessage, SlotsSnapshot } from '../agent.types.js';
import { ageFrom, detectLanguage, parseBirthDate } from './slots.js';

/**
 * Слоты клиента: что берём из состояния в промпт и что дописываем обратно
 * после хода. Чистые функции — состояние на вход, патч на выход; запись
 * делает ChatStateService.
 *
 * Правило одно на всех: слот, который правил менеджер (`manualSlots`),
 * не перезаписываем никогда.
 */

export function snapshot(state: AiChatStateEntity): SlotsSnapshot {
  return {
    birthDate: state.birthDate,
    birthDateText: state.birthDateText,
    birthPlace: state.birthPlace,
    age: state.age,
    gender: state.gender,
    language: state.language || 'ru',
    requestCategoryKey: state.requestCategoryKey,
    requestSummary: state.requestSummary,
    manualSlots: state.manualSlots,
  };
}

/** Что вынимаем кодом из входящих до вызова модели: дату рождения, возраст, язык. */
export function slotsFromMessages(
  state: AiChatStateEntity,
  batch: HistoryMessage[],
  now: Date,
): Partial<AiChatStateEntity> {
  const patch: Partial<AiChatStateEntity> = {};
  if (batch.length === 0) return patch;
  const text = batch.map((m) => m.text).join('\n');
  const manual = new Set(state.manualSlots);

  if (!manual.has('birthDate') && !state.birthDate) {
    const parsed = parseBirthDate(text, now);
    if (parsed) {
      patch.birthDateText = parsed.text;
      if (parsed.iso) Object.assign(patch, birthPatch(parsed.iso, now));
    }
  }
  if (!manual.has('language')) {
    const language = detectLanguage(text);
    if (language && language !== 'other') patch.language = language;
  }
  return patch;
}

/** Слоты из анализа модели — только пустые, ручные не трогаем. */
export function slotsFromAnalysis(
  state: AiChatStateEntity,
  output: ComposerOutput,
  now: Date,
): Partial<AiChatStateEntity> {
  const slots = output.analysis.slots ?? {};
  const patch: Partial<AiChatStateEntity> = {};
  const manual = new Set(state.manualSlots);

  if (!manual.has('birthDate') && !state.birthDate && slots.birthDate) {
    const parsed = parseBirthDate(slots.birthDate, now);
    if (parsed?.iso) {
      Object.assign(patch, birthPatch(parsed.iso, now));
      patch.birthDateText = slots.birthDateText ?? state.birthDateText ?? parsed.text;
    }
  }
  if (!manual.has('birthPlace') && !state.birthPlace && slots.birthPlace) patch.birthPlace = slots.birthPlace;
  // Запрос уточняем, только если модель поняла его подробнее прежнего.
  if (!manual.has('request') && slots.requestSummary && (!state.requestSummary || state.requestSummary.length < slots.requestSummary.length)) {
    patch.requestSummary = slots.requestSummary;
  }
  if (!manual.has('request') && slots.requestCategoryKey && !state.requestCategoryKey) patch.requestCategoryKey = slots.requestCategoryKey;
  if (!manual.has('gender') && !state.gender && slots.genderHint) {
    patch.gender = slots.genderHint;
    patch.genderSource = 'text';
  }
  if (!manual.has('language') && output.analysis.language !== 'other' && output.analysis.language !== state.language) {
    patch.language = output.analysis.language;
  }
  if (slots.isMinorHint && !manual.has('birthDate')) patch.isMinor = true;
  return patch;
}

/** Дата рождения тянет за собой возраст и признак несовершеннолетия. */
function birthPatch(iso: string, now: Date): Partial<AiChatStateEntity> {
  const age = ageFrom(iso, now);
  return { birthDate: iso, age, isMinor: age !== null && age < 18 };
}
