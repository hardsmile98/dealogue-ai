import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import { useMemo } from 'react'
import { getApiErrorMessage } from '@/shared/lib'
import { EmptyState } from '@/shared/ui'
import { useGetChatAiSummariesQuery } from '@/entities/ai-agent'
import { useGetChatsQuery } from '@/entities/chat'
import { ChatList } from './ChatList'
import { chatPanelStyles as styles } from './ChatPanel.styles'
import { ChatThread } from './ChatThread'

interface ChatPanelProps {
  accountId: string
  selectedChatId: string | null
  onSelectChat: (chatId: string | null) => void
}

/**
 * Две колонки: список чатов и переписка. На узких экранах показывается
 * одна из них — в зависимости от того, выбран ли чат.
 */
export function ChatPanel({ accountId, selectedChatId, onSelectChat }: ChatPanelProps) {
  const theme = useTheme()
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'))

  // Новые диалоги и сообщения приходят с backend'а по мере синхронизации.
  const { data: chats, isLoading, error } = useGetChatsQuery(
    { accountId },
    { pollingInterval: 15_000 },
  )
  const { data: aiSummaries } = useGetChatAiSummariesQuery(accountId, { pollingInterval: 30_000 })
  const summaries = useMemo(() => new Map((aiSummaries ?? []).map((s) => [s.chatId, s])), [aiSummaries])
  const selected = chats?.find((chat) => chat.id === selectedChatId) ?? null

  if (error) {
    return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить чаты')}</Alert>
  }

  const showList = !isNarrow || selected === null
  const showThread = !isNarrow || selected !== null

  return (
    <Box sx={[styles.root, isNarrow && { gridTemplateColumns: '1fr' }]}>
      {showList && (
        <ChatList
          chats={chats}
          summaries={summaries}
          isLoading={isLoading}
          selectedId={selectedChatId}
          onSelect={onSelectChat}
        />
      )}

      {showThread &&
        (selected ? (
          <ChatThread
            key={selected.id}
            accountId={accountId}
            chat={selected}
            onBack={isNarrow ? () => onSelectChat(null) : undefined}
          />
        ) : (
          <Box sx={[styles.threadPane, styles.threadEmpty]}>
            <EmptyState
              size="compact"
              icon={<ForumOutlinedIcon />}
              title="Выберите чат"
              description="Слева — все диалоги аккаунта. Первое сообщение каждого помечено кодом, по которому строится статистика."
            />
          </Box>
        ))}
    </Box>
  )
}
