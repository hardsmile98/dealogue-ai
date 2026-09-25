import type { Message } from '@/entities/chat';

/**
 * Сообщения клиента подряд перед ответом с индексом `index` — «что
 * написал клиент» для примера. Наши сообщения между ними и ответом
 * пропускаются, серия клиента заканчивается на первом нашем перед ней.
 */
export function clientBefore(
  messages: readonly Message[],
  index: number,
): string {
  const parts: string[] = [];
  for (let i = index - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) break;
    if (message.direction === 'out') {
      if (parts.length > 0) break;
      continue;
    }
    parts.unshift(message.text);
  }
  return parts.join('\n');
}
