import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { accountLinks } from '@/shared/config';
import { ChatPanel } from '@/widgets/chat-panel';

/** Вкладка «Чаты». Выбранный чат живёт в URL, чтобы ссылку на диалог можно было открыть напрямую. */
export function AccountChatsPage() {
  const { accountId = '', chatId = null } = useParams<{
    accountId: string;
    chatId?: string;
  }>();
  const navigate = useNavigate();

  // Стабильная ссылка: строки списка мемоизированы и не должны
  // перерисовываться из-за нового колбэка на каждом рендере.
  const selectChat = useCallback(
    (next: string | null) =>
      navigate(
        next
          ? accountLinks.chat(accountId, next)
          : accountLinks.chats(accountId),
      ),
    [accountId, navigate],
  );

  return (
    <ChatPanel
      accountId={accountId}
      selectedChatId={chatId}
      onSelectChat={selectChat}
    />
  );
}
