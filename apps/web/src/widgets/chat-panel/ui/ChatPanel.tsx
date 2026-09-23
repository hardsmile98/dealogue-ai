import Box from '@mui/material/Box'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import { EmptyState } from '@/shared/ui'
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
  const showList = !isNarrow || selectedChatId === null
  const showThread = !isNarrow || selectedChatId !== null

  return (
    <Box sx={[styles.root, isNarrow && styles.singleColumn]}>
      {showList && <ChatList accountId={accountId} selectedId={selectedChatId} onSelect={onSelectChat} />}

      {showThread &&
        (selectedChatId ? (
          <ChatThread
            key={selectedChatId}
            accountId={accountId}
            chatId={selectedChatId}
            onBack={isNarrow ? () => onSelectChat(null) : undefined}
          />
        ) : (
          <Box sx={styles.emptyThread}>
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
