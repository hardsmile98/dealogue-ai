import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { formatDateTime } from '@/shared/lib'
import { LeadCodeChip } from '@/entities/chat'
import type { Chat } from '@/entities/chat'
import { AccountAvatar } from '@/entities/telegram-account'
import { chatThreadStyles as styles } from './ChatThread.styles'

interface ChatThreadHeaderProps {
  /** undefined — чат ещё грузится. */
  chat: Chat | undefined
  onBack?: () => void
}

export function ChatThreadHeader({ chat, onBack }: ChatThreadHeaderProps) {
  const peerMeta = chat
    ? [chat.peer.username ? `@${chat.peer.username}` : null, chat.peer.phone].filter(Boolean).join(' · ')
    : ''

  return (
    <Box sx={styles.header}>
      {onBack && (
        <IconButton size="small" onClick={onBack} aria-label="К списку чатов" sx={styles.backButton}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
      )}
      {chat ? (
        <>
          <AccountAvatar name={chat.peer.name} size={40} />
          <Box sx={styles.headerText}>
            <Typography sx={styles.peerName}>{chat.peer.name}</Typography>
            <Typography sx={styles.peerMeta}>{peerMeta || 'Без username и телефона'}</Typography>
            <Box sx={styles.headerChips}>
              <LeadCodeChip code={chat.leadCode} showEmpty />
              <span>Первое сообщение {formatDateTime(chat.firstMessageAt)}</span>
            </Box>
          </Box>
        </>
      ) : (
        <>
          <Skeleton variant="circular" width={40} height={40} />
          <Box sx={styles.headerText}>
            <Skeleton width={180} />
            <Skeleton width={120} />
          </Box>
        </>
      )}
    </Box>
  )
}
