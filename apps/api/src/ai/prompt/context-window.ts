import type { MessageDirection } from '../../telegram/entities/telegram-chat.entity.js';
import type { LlmMessage } from '../llm/llm-provider.interface.js';

export interface HistoryMessage {
  direction: MessageDirection;
  text: string;
  sentAt: Date;
  aiRunId?: string | null;
}

const MEDIA_RE = /^\[([^\]]+)\]$/;

/** Медиа-заглушку из базы — в понятную модели форму. */
export function describeForModel(text: string, direction: MessageDirection): string {
  const match = MEDIA_RE.exec(text.trim());
  if (!match) return text.trim();
  const who = direction === 'in' ? 'клиент отправил' : 'менеджер отправил';
  return `[${who}: ${match[1].toLowerCase()}]`;
}

/**
 * История чата → чередующиеся ходы user/assistant. Подряд идущие сообщения
 * одной стороны склеиваются переводом строки; ведущий ход ассистента
 * получает синтетическое «[начало диалога]» от пользователя; хвост
 * обрезается по бюджету символов с начала.
 */
export function buildConversation(history: HistoryMessage[], charBudget: number): LlmMessage[] {
  const merged: LlmMessage[] = [];
  for (const item of history) {
    const role = item.direction === 'in' ? 'user' : 'assistant';
    const content = describeForModel(item.text, item.direction);
    if (!content) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === role) last.content += `\n${content}`;
    else merged.push({ role, content });
  }

  // Бюджет: выкидываем самые старые ходы, пока не влезем.
  let total = merged.reduce((n, m) => n + m.content.length, 0);
  while (merged.length > 1 && total > charBudget) {
    const removed = merged.shift();
    total -= removed?.content.length ?? 0;
  }
  if (merged.length === 1 && merged[0].content.length > charBudget) {
    merged[0].content = merged[0].content.slice(-charBudget);
  }

  if (merged.length > 0 && merged[0].role === 'assistant') {
    merged.unshift({ role: 'user', content: '[начало диалога]' });
  }
  return merged;
}
