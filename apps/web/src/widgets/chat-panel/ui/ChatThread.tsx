import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { getApiErrorMessage } from '@/shared/lib'
import { EmptyState } from '@/shared/ui'
import { useGetChatQuery } from '@/entities/chat'
import { ChatComposer } from './ChatComposer'
import { chatThreadStyles as styles } from './ChatThread.styles'
import { ChatThreadHeader } from './ChatThreadHeader'
import { MessageFeed } from './MessageFeed'

interface ChatThreadProps {
  accountId: string
  chatId: string
  /** Кнопка «назад» к списку — только на узких экранах. */
  onBack?: () => void
}

/**
 * Переписка с одним собеседником. Чат грузится отдельно от списка: по
 * прямой ссылке его может не быть среди загруженных страниц.
 */
export function ChatThread({ accountId, chatId, onBack }: ChatThreadProps) {
  const { data: chat, error } = useGetChatQuery({ accountId, chatId })

  if (error) {
    return (
      <Box sx={[styles.pane, styles.notFound]}>
        <EmptyState
          size="compact"
          title="Чат не открылся"
          description={getApiErrorMessage(error, 'Возможно, он был удалён.')}
          action={onBack && <Button onClick={onBack}>К списку чатов</Button>}
        />
      </Box>
    )
  }

  return (
    <Box sx={styles.pane}>
      <ChatThreadHeader chat={chat} onBack={onBack} />
      <MessageFeed accountId={accountId} chatId={chatId} chat={chat} />
      <ChatComposer accountId={accountId} chatId={chatId} />
    </Box>
  )
}
