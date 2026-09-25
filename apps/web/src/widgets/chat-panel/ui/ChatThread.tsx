import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import { getApiErrorMessage } from '@/shared/lib'
import { EmptyState } from '@/shared/ui'
import { useGetChatQuery } from '@/entities/chat'
import { ChatAgentButton, ChatAgentDrawer } from '@/features/bot-chat'
import { ToSandboxButton } from '@/features/bot-sandbox'
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
  const [agentOpen, setAgentOpen] = useState(false)
  const [focusTurnId, setFocusTurnId] = useState<string | null>(null)

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
      <ChatThreadHeader
        chat={chat}
        onBack={onBack}
        actions={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: 'flex-end' }}>
            <ChatAgentButton
              accountId={accountId}
              chatId={chatId}
              onOpen={() => {
                setFocusTurnId(null)
                setAgentOpen(true)
              }}
            />
            <ToSandboxButton accountId={accountId} chatId={chatId} />
          </Stack>
        }
      />
      <MessageFeed
        accountId={accountId}
        chatId={chatId}
        chat={chat}
        onOpenTurn={(turnId) => {
          setFocusTurnId(turnId)
          setAgentOpen(true)
        }}
      />
      <ChatAgentDrawer
        accountId={accountId}
        chatId={chatId}
        open={agentOpen}
        focusTurnId={focusTurnId}
        onClose={() => setAgentOpen(false)}
      />
      <ChatComposer accountId={accountId} chatId={chatId} />
    </Box>
  )
}
