import Box from '@mui/material/Box'
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import DoneIcon from '@mui/icons-material/Done'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import { formatDateTime, formatTime } from '@/shared/lib'
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
        {message.mediaKind && (
          <Box component="span" sx={styles.mediaTag} title="Вложение — бот его не видит">
            <AttachFileOutlinedIcon />
          </Box>
        )}
        {message.text}
        <Box sx={styles.meta}>
          {message.byBot && (
            <Box component="span" sx={styles.aiTag} title="Сообщение отправил бот">
              <SmartToyOutlinedIcon />
              бот
            </Box>
          )}
          {formatTime(message.sentAt)}
          {!incoming && (
            <Box
              component="span"
              sx={[styles.readMark, message.readAt ? styles.readMarkRead : {}]}
              title={message.readAt ? `Прочитано ${formatDateTime(message.readAt)}` : 'Не прочитано'}
            >
              {message.readAt ? <DoneAllIcon /> : <DoneIcon />}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
