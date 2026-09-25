import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import DoneIcon from '@mui/icons-material/Done'
import type { SandboxMessageDto } from '@/shared/api'
import { formatDateTime, formatTime } from '@/shared/lib'
import { formatDuration } from '@/entities/bot'
import { sandboxStyles as styles } from './sandbox.styles'

/** Длинные тела вех (диагностика, услуги, цены) свёрнуты — в ленте важен разговор вокруг них. */
const COLLAPSE_LENGTH = 400

function SandboxBubble({ message }: { message: SandboxMessageDto }) {
  const [expanded, setExpanded] = useState(false)
  const incoming = message.direction === 'in'
  const collapsible = message.block && message.text.length > COLLAPSE_LENGTH
  const timing = [
    message.delayMs !== null ? `пауза ${formatDuration(message.delayMs)}` : null,
    message.typingMs ? `печатал ${formatDuration(message.typingMs)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Box sx={[styles.row, incoming ? styles.rowIn : styles.rowOut]}>
      <Box sx={[styles.bubble, incoming ? styles.bubbleIn : styles.bubbleOut, message.block ? styles.bubbleBlock : {}]}>
        {message.block && <Box sx={styles.blockBadge}>Веха из библиотеки</Box>}
        {message.mediaKind && <Box sx={styles.blockBadge}>Вложение: {message.mediaKind}</Box>}
        <Box sx={collapsible && !expanded ? styles.collapsed : undefined}>{message.text}</Box>
        {collapsible && (
          <Button size="small" sx={styles.expand} onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Свернуть' : 'Показать целиком'}
          </Button>
        )}
        <Box sx={styles.meta} title={formatDateTime(message.sentAt)}>
          {timing && <span>{timing}</span>}
          <span>{formatTime(message.sentAt)}</span>
          {!incoming && (
            <Box
              component="span"
              sx={message.readAt ? styles.readMark : styles.unreadMark}
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

interface SandboxFeedProps {
  messages: SandboxMessageDto[]
}

/** Переписка песочницы; время — виртуальное, задержки агента подписаны числом. */
export function SandboxFeed({ messages }: SandboxFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null)
  const lastId = messages[messages.length - 1]?.id

  // Новое сообщение — ленту вниз, как в мессенджере.
  useEffect(() => {
    const feed = feedRef.current
    if (feed) feed.scrollTop = feed.scrollHeight
  }, [lastId])

  return (
    <Box ref={feedRef} sx={styles.feed}>
      {messages.length === 0 ? (
        <Box sx={styles.feedEmpty}>
          Напишите первое сообщение за клиента — например, «Здравствуйте! Хочу бесплатный расклад, код 12» — и нажмите
          «Ответить агентом».
        </Box>
      ) : (
        messages.map((message) => <SandboxBubble key={message.id} message={message} />)
      )}
    </Box>
  )
}
