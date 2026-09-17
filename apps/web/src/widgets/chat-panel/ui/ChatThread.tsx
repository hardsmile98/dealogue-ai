import { useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import SendIcon from '@mui/icons-material/Send'
import { formatDateTime, formatDayDivider, getApiErrorMessage, toDayKey } from '@/shared/lib'
import { ALERT_TYPE_META } from '@/entities/alert'
import {
  LeadCodeChip,
  MessageBubble,
  useClearAttentionMutation,
  useGetMessagesQuery,
  useMarkAttentionSeenMutation,
  useSendMessageMutation,
} from '@/entities/chat'
import type { Chat, Message } from '@/entities/chat'
import { AccountAvatar } from '@/entities/telegram-account'
import { chatPanelStyles as styles } from './ChatPanel.styles'

interface ChatThreadProps {
  accountId: string
  chat: Chat
  /** Кнопка «назад» к списку — только на узких экранах. */
  onBack?: () => void
}

interface DayGroup {
  key: string
  messages: Message[]
}

function groupByDay(messages: Message[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const message of messages) {
    const key = toDayKey(message.sentAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.messages.push(message)
    else groups.push({ key, messages: [message] })
  }
  return groups
}

export function ChatThread({ accountId, chat, onBack }: ChatThreadProps) {
  const { data: messages, isLoading, error } = useGetMessagesQuery(
    { accountId, chatId: chat.id },
    { pollingInterval: 10_000 },
  )
  const [markSeen] = useMarkAttentionSeenMutation()
  const [clearAttention, { isLoading: clearing }] = useClearAttentionMutation()
  const [sendMessage, { isLoading: sending, error: sendError }] = useSendMessageMutation()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => groupByDay(messages ?? []), [messages])
  const firstIncomingId = useMemo(
    () => messages?.find((message) => message.direction === 'in')?.id ?? null,
    [messages],
  )

  // Новый чат — показываем конец переписки, как в Telegram.
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages])

  // Менеджер открыл чат с пометкой — алерты считаем увиденными.
  useEffect(() => {
    if (chat.attention.needed) void markSeen({ accountId, chatId: chat.id })
  }, [accountId, chat.id, chat.attention.needed, markSeen])

  const submit = async () => {
    const text = draft.trim()
    if (!text || sending) return
    const result = await sendMessage({ accountId, chatId: chat.id, text })
    if (!('error' in result)) setDraft('')
  }

  const peerMeta = [chat.peer.username ? `@${chat.peer.username}` : null, chat.peer.phone]
    .filter(Boolean)
    .join(' · ')
  const attention = chat.attention.reason ? ALERT_TYPE_META[chat.attention.reason] : null
  const attentionSeverity =
    attention?.color === 'success' ? 'success' : attention?.color === 'error' ? 'error' : attention?.color === 'info' ? 'info' : 'warning'

  return (
    <Box sx={styles.threadPane}>
      <Box sx={styles.threadHeader}>
        {onBack && (
          <IconButton size="small" onClick={onBack} aria-label="К списку чатов" sx={{ mr: -0.5 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        <AccountAvatar name={chat.peer.name} size={40} />
        <Box sx={styles.threadHeaderText}>
          <Typography sx={styles.threadPeerName}>{chat.peer.name}</Typography>
          <Typography sx={styles.threadPeerMeta}>{peerMeta || 'Без username и телефона'}</Typography>
          <Box sx={styles.threadChips}>
            <LeadCodeChip code={chat.leadCode} showEmpty />
            <span>Первое сообщение {formatDateTime(chat.firstMessageAt)}</span>
          </Box>
        </Box>
      </Box>

      {attention && chat.attention.needed && (
        <Alert
          severity={attentionSeverity}
          icon={<NotificationsActiveOutlinedIcon fontSize="inherit" />}
          sx={styles.attentionBar}
          action={
            <Button
              color="inherit"
              size="small"
              loading={clearing}
              onClick={() => void clearAttention({ accountId, chatId: chat.id })}
            >
              Снять пометку
            </Button>
          }
        >
          <strong>{attention.label}.</strong> {attention.description}
        </Alert>
      )}

      <Box ref={scrollRef} sx={styles.messages}>
        {error && (
          <Alert severity="error" sx={{ mx: 2 }}>
            {getApiErrorMessage(error, 'Не удалось загрузить сообщения')}
          </Alert>
        )}

        {isLoading &&
          [0, 1, 2, 3].map((i) => (
            <Box
              key={i}
              sx={{ display: 'flex', justifyContent: i % 2 ? 'flex-end' : 'flex-start', px: 2, py: 0.5 }}
            >
              <Skeleton variant="rounded" width={`${40 + (i % 3) * 12}%`} height={48} sx={{ borderRadius: 3 }} />
            </Box>
          ))}

        {groups.map((group) => (
          <Box key={group.key}>
            <Box sx={styles.dayDivider}>
              <Box sx={styles.dayDividerLabel}>{formatDayDivider(group.key)}</Box>
            </Box>
            {group.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isFirst={message.id === firstIncomingId}
                leadCode={chat.leadCode}
              />
            ))}
          </Box>
        ))}
      </Box>

      <Box sx={styles.composer}>
        {sendError && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {getApiErrorMessage(sendError, 'Не удалось отправить сообщение')}
          </Alert>
        )}
        <Box sx={styles.composerRow}>
          <TextField
            fullWidth
            multiline
            maxRows={6}
            size="small"
            placeholder="Написать клиенту от имени аккаунта… (Ctrl+Enter — отправить)"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <IconButton
            color="primary"
            aria-label="Отправить"
            disabled={!draft.trim() || sending}
            onClick={() => void submit()}
          >
            <SendIcon />
          </IconButton>
        </Box>
        <Typography sx={styles.composerHint}>
          Сообщение уйдёт в Telegram от имени аккаунта. Если бот вёл этот чат, он передаст его вам.
        </Typography>
      </Box>
    </Box>
  )
}
