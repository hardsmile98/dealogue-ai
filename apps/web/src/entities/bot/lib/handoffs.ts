import type { HandoffChatDto } from '@/shared/api';

export interface HandoffGroup {
  title: string;
  chats: HandoffChatDto[];
}

/** В какую группу списка «у менеджера» попадает чат. */
function groupTitle(chat: HandoffChatDto): string {
  if (chat.label === 'needs_reply' || chat.label === 'agent_unavailable') {
    return 'Ждут ответа';
  }
  if (chat.label === 'prices_silent') return 'Цены отправлены, молчат';
  return 'Ведёт менеджер';
}

/**
 * Режет список «у менеджера» на группы, сохраняя порядок сервера: он уже
 * отсортировал ждущих ответа наверх, дольше всех ждущих — первыми.
 */
export function groupHandoffs(
  chats: readonly HandoffChatDto[],
): HandoffGroup[] {
  const groups: HandoffGroup[] = [];
  for (const chat of chats) {
    const title = groupTitle(chat);
    const last = groups.at(-1);
    if (last?.title === title) last.chats.push(chat);
    else groups.push({ title, chats: [chat] });
  }
  return groups;
}
