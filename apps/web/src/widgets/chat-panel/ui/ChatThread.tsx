import { useEffect, useMemo, useRef } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { formatDateTime, formatDayDivider, getApiErrorMessage, toDayKey } from '@/shared/lib'
import {
  ATTENTION_REASON_META,
  AiStageChip,
  useClearAttentionMutation,
  useGetAiSettingsQuery,
  useMarkAttentionSeenMutation,
} from '@/entities/ai-agent'
import { LeadCodeChip, MessageBubble, useGetMessagesQuery } from '@/entities/chat'
import type { Chat, Message } from '@/entities/chat'
import { AccountAvatar } from '@/entities/telegram-account'
import { ChatAiSwitch } from '@/features/ai-agent/toggle-chat'
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
  const { data: settings } = useGetAiSettingsQuery(accountId)
  const [markSeen] = useMarkAttentionSeenMutation()
  const [clearAttention, { isLoading: clearing }] = useClearAttentionMutation()
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

  const peerMeta = [chat.peer.username ? `@${chat.peer.username}` : null, chat.peer.phone]
    .filter(Boolean)
    .join(' · ')
  const attention = chat.attention.reason ? ATTENTION_REASON_META[chat.attention.reason] : null
  const aiActive = chat.ai.enabled && !chat.ai.pausedReason

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
            <AiStageChip stageKey={chat.ai.stage} stages={settings?.script.stages} />
            <span>Первое сообщение {formatDateTime(chat.firstMessageAt)}</span>
          </Box>
        </Box>
        <Box sx={styles.threadHeaderRight}>
          <ChatAiSwitch chat={chat} />
        </Box>
      </Box>

      {attention && chat.attention.needed && (
        <Alert
          severity={attention.color === 'success' ? 'success' : attention.color === 'error' ? 'error' : 'warning'}
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

      <Box sx={styles.threadFooter}>
        {aiActive ? (
          <>
            <SmartToyOutlinedIcon />
            ИИ отвечает в этом чате. Чтобы вести диалог вручную — выключите переключатель или просто ответьте из
            Telegram: ИИ остановится сам.
            {chat.ai.messagesCount > 0 && (
              <Chip size="small" variant="outlined" label={`сообщений ИИ: ${chat.ai.messagesCount}`} sx={{ ml: 'auto' }} />
            )}
          </>
        ) : (
          <>
            <VisibilityOutlinedIcon />
            Режим наблюдения: сообщения только читаются. Отвечать — из самого Telegram.
          </>
        )}
      </Box>
    </Box>
  )
}
