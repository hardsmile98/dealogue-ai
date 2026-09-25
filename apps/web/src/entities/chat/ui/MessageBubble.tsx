import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import DoneIcon from '@mui/icons-material/Done'
import { formatDateTime, formatTime } from '@/shared/lib'
import type { Message } from '../model/types'
import { LeadCodeChip } from './LeadCodeChip'
import { messageBubbleStyles as styles } from './MessageBubble.styles'

interface MessageBubbleProps {
  message: Message
  /** Первое входящее сообщение диалога — по нему считается статистика. */
  isFirst?: boolean
  leadCode?: string | null
  /** Действие у сообщения (видно при наведении): «продолжить в песочнице», «в примеры». */
  action?: ReactNode
  /** Постоянная пометка в строке времени: например, «ответ агента». */
  marker?: ReactNode
}

export function MessageBubble({ message, isFirst = false, leadCode = null, action, marker }: MessageBubbleProps) {
  const incoming = message.direction === 'in'
  return (
    <Box sx={[styles.row, incoming ? styles.rowIn : styles.rowOut, action ? styles.withAction : {}]}>
      <Box sx={[styles.bubble, incoming ? styles.bubbleIn : styles.bubbleOut]}>
        {isFirst && (
          <Box sx={styles.firstBadge}>
            Первое сообщение
            <LeadCodeChip code={leadCode} showEmpty />
          </Box>
        )}
        {message.mediaKind && (
          <Box component="span" sx={styles.mediaTag} title="Вложение">
            <AttachFileOutlinedIcon />
          </Box>
        )}
        {message.text}
        <Box sx={styles.meta}>
          {action && (
            <Box className="bubble-action" sx={styles.action}>
              {action}
            </Box>
          )}
          {marker}
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
