import { useNavigate, useParams } from 'react-router-dom'
import { accountLinks } from '@/shared/config'
import { ChatPanel } from '@/widgets/chat-panel'

/** Выбранный чат живёт в URL, чтобы ссылку на диалог можно было открыть напрямую. */
export function AccountChatsPage() {
  const { accountId = '', chatId = null } = useParams<{ accountId: string; chatId?: string }>()
  const navigate = useNavigate()

  return (
    <ChatPanel
      accountId={accountId}
      selectedChatId={chatId}
      onSelectChat={(next) =>
        navigate(next ? accountLinks.chat(accountId, next) : accountLinks.chats(accountId))
      }
    />
  )
}
