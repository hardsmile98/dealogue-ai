import Box from '@mui/material/Box'
import { formatTime } from '@/shared/lib'
import type { Message } from '../model/types'
import { LeadCodeChip } from './LeadCodeChip'
import { messageBubbleStyles as styles } from './MessageBubble.styles'

interface MessageBubbleProps {
  message: Message
  /** Первое входящее сообщение диалога — по нему считается статистика. */
  isFirst?: boolean
  leadCode?: string | null
}

export function MessageBubble({ message, isFirst = false, leadCode = null }: MessageBubbleProps) {
  const incoming = message.direction === 'in'
  return (
    <Box sx={[styles.row, incoming ? styles.rowIn : styles.rowOut]}>
      <Box sx={[styles.bubble, incoming ? styles.bubbleIn : styles.bubbleOut]}>
        {isFirst && (
          <Box sx={styles.firstBadge}>
            Первое сообщение
            <LeadCodeChip code={leadCode} showEmpty />
          </Box>
        )}
        {message.text}
        <Box sx={styles.meta}>{formatTime(message.sentAt)}</Box>
      </Box>
    </Box>
  )
}
