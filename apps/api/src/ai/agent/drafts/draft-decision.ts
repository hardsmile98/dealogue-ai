/**
 * Чистая часть решений менеджера по черновику (раздел 8.3 ТЗ): какой
 * статус записать, как склеить ручные ответы из Telegram и что написать
 * в уведомлении. Без Nest и базы — чтобы проверять тестами.
 */

import type { DraftKind, DraftStatus, HandoffReason } from '../../domain/types.js';

/** Сколько сообщений менеджера подряд считаем одним ответом (раздел 9.1 ТЗ). */
export const MANAGER_GLUE_MS = 3 * 60_000;

/** Черновик ещё ждёт решения. */
export const OPEN_DRAFT_STATUSES: DraftStatus[] = ['pending', 'pending_classification'];

export function isOpen(status: DraftStatus): boolean {
  return OPEN_DRAFT_STATUSES.includes(status);
}

/**
 * Что записать в статус: отправили как есть, с правками или свой ответ.
 * «Свой ответ» менеджер выбирает кнопкой (`own`), правку определяем сравнением
 * с предложенным текстом; черновик без текста (медиа, ошибка провайдера) всегда
 * заменён.
 */
export function decideStatus(draftMessages: string[], finalMessages: string[], own: boolean): DraftStatus {
  if (own || draftMessages.length === 0) return 'replaced';
  return sameMessages(draftMessages, finalMessages) ? 'sent_as_is' : 'edited';
}

export function sameMessages(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((text, index) => normalize(text) === normalize(b[index]));
}

/** Ответ менеджера пришёл вплотную к предыдущему — это продолжение того же ответа. */
export function shouldGlue(decidedAt: Date | null, now: Date): boolean {
  if (!decidedAt) return false;
  const delta = now.getTime() - decidedAt.getTime();
  return delta >= 0 && delta <= MANAGER_GLUE_MS;
}

export function glueFinalText(previous: string | null, next: string): string {
  const before = (previous ?? '').trim();
  return before ? `${before}\n${next.trim()}` : next.trim();
}

export interface NotifyTextParams {
  kind: DraftKind;
  reason: HandoffReason | null;
  peerName: string;
  clientText: string;
  link: string;
}

/** Сколько символов входящего показываем в уведомлении (раздел 7 ТЗ). */
const PREVIEW_LIMIT = 120;

/**
 * Уведомление менеджеру в Telegram. Текст черновика не дублируем — чтобы его
 * нельзя было переслать клиенту по ошибке.
 */
export function buildNotifyText(params: NotifyTextParams): string {
  const head =
    params.kind === 'supervised'
      ? 'Ход бота ждёт подтверждения'
      : `Нужен менеджер${params.reason ? ` (${HANDOFF_REASON_WORDS[params.reason] ?? params.reason})` : ''}`;
  const quote = preview(params.clientText, PREVIEW_LIMIT);
  const who = params.peerName.trim() || 'Клиент';
  return [`${head}.`, quote ? `${who}: «${quote}»` : who, params.link].join('\n');
}

export function preview(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Причины передачи по-русски — для уведомления в Telegram. */
export const HANDOFF_REASON_WORDS: Record<HandoffReason, string> = {
  ready_to_pay: 'готов оплатить',
  suspects_bot: 'подозревает бота',
  wants_human: 'просит человека',
  aggression: 'агрессия',
  crisis: 'острая ситуация',
  minor: 'несовершеннолетний',
  refusal: 'просит не писать',
  out_of_scope: 'вопрос вне фактов',
  unsure: 'модель не уверена',
  media: 'медиа без текста',
  guard_failed: 'проверка не пройдена',
  provider_error: 'ошибка провайдера',
  loop: 'разговор по кругу',
  auto_limit: 'лимит сообщений без ответа',
  language: 'другой язык',
  stale_lead: 'лид долго ждал',
  manual: 'вручную',
};

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
