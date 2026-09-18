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
import { formatDateTime, formatDayDivider, getApiErrorMessage, isMutationSuccess, toDayKey } from '@/shared/lib'
import type { TurnDto } from '@/shared/api'
import { ALERT_TYPE_META } from '@/entities/alert'
import { TURN_OUTCOME_META, useGetChatTurnsQuery } from '@/entities/ai-agent'
import {
  GhostBubble,
  LeadCodeChip,
  MessageBubble,
  useClearAttentionMutation,
  useGetMessagesQuery,
  useMarkAttentionSeenMutation,
  useSendMessageMutation,
} from '@/entities/chat'
import type { Chat, Message } from '@/entities/chat'
import { AccountAvatar } from '@/entities/telegram-account'
import { ChatAiPanel, RateTurn, TurnsJournal } from '@/widgets/chat-agent'
import { chatPanelStyles as styles } from './ChatPanel.styles'

interface ChatThreadProps {
  accountId: string
  chat: Chat
  /** Кнопка «назад» к списку — только на узких экранах. */
  onBack?: () => void
}

/** Элемент ленты: реальное сообщение или «отправил бы» из журнала (сухой прогон, черновик). */
type ThreadItem =
  | { kind: 'message'; at: string; message: Message }
  | { kind: 'ghost'; at: string; id: string; text: string; label: string; turn: TurnDto }

interface DayGroup {
  key: string
  items: ThreadItem[]
}

function groupByDay(items: ThreadItem[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const item of items) {
    const key = toDayKey(item.at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, items: [item] })
  }
  return groups
}

/** Ходы без отправки в Telegram показываем в ленте пунктиром. */
function ghostsOf(turns: TurnDto[]): ThreadItem[] {
  const result: ThreadItem[] = []
  for (const turn of turns) {
    if (turn.outcome !== 'dry_run' && turn.outcome !== 'awaiting_approval') continue
    // Черновик менеджеру виден в карточке над лентой — в самой ленте не дублируем.
    if (turn.trigger === 'manager_draft') continue
    turn.messagesPlanned.forEach((m, index) => {
      result.push({ kind: 'ghost', at: turn.createdAt, id: `${turn.id}:${index}`, text: m.text, label: TURN_OUTCOME_META[turn.outcome].label, turn })
    })
  }
  return result
}

export function ChatThread({ accountId, chat, onBack }: ChatThreadProps) {
  const { data: messages, isLoading, error } = useGetMessagesQuery(
    { accountId, chatId: chat.id },
    { pollingInterval: 10_000 },
  )
  const { data: turns } = useGetChatTurnsQuery({ accountId, chatId: chat.id, limit: 100 })
  const [markSeen] = useMarkAttentionSeenMutation()
  const [clearAttention, { isLoading: clearing }] = useClearAttentionMutation()
  const [sendMessage, { isLoading: sending, error: sendError }] = useSendMessageMutation()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const turnsById = useMemo(() => new Map((turns ?? []).map((t) => [t.id, t])), [turns])
  const items = useMemo(() => {
    const real: ThreadItem[] = (messages ?? []).map((message) => ({ kind: 'message', at: message.sentAt, message }))
    return [...real, ...ghostsOf(turns ?? [])].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }, [messages, turns])
  const groups = useMemo(() => groupByDay(items), [items])
  const firstIncomingId = useMemo(
    () => messages?.find((message) => message.direction === 'in')?.id ?? null,
    [messages],
  )

  // Новый чат — показываем конец переписки, как в Telegram.
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [items])

  // Менеджер открыл чат с пометкой — алерты считаем увиденными.
  useEffect(() => {
    if (chat.attention.needed) void markSeen({ accountId, chatId: chat.id })
  }, [accountId, chat.id, chat.attention.needed, markSeen])

  const submit = async () => {
    const text = draft.trim()
    if (!text || sending) return
    const result = await sendMessage({ accountId, chatId: chat.id, text })
    if (isMutationSuccess(result)) setDraft('')
  }

  const peerMeta = [chat.peer.username ? `@${chat.peer.username}` : null, chat.peer.phone]
    .filter(Boolean)
    .join(' · ')
  const attention = chat.attention.reason ? ALERT_TYPE_META[chat.attention.reason] : null
  const attentionSeverity =
    attention?.color === 'success' ? 'success' : attention?.color === 'error' ? 'error' : attention?.color === 'info' ? 'info' : 'warning'

  const rateFor = (turnId: string | null) => {
    const turn = turnId ? turnsById.get(turnId) : null
    return turn ? <RateTurn accountId={accountId} chatId={chat.id} turn={turn} /> : undefined
  }

  return (
    <Box sx={styles.threadPane}>
      <Box sx={styles.threadHeader}>
        {onBack && (
          <IconButton size="small" onClick={onBack} aria-label="К списку чатов" sx={styles.backButton}>
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

      <ChatAiPanel accountId={accountId} chatId={chat.id} />

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
          <Alert severity="error" sx={styles.messagesError}>
            {getApiErrorMessage(error, 'Не удалось загрузить сообщения')}
          </Alert>
        )}

        {isLoading &&
          [0, 1, 2, 3].map((i) => (
            <Box key={i} sx={[styles.messageSkeletonRow, { justifyContent: i % 2 ? 'flex-end' : 'flex-start' }]}>
              <Skeleton variant="rounded" width={`${40 + (i % 3) * 12}%`} height={48} />
            </Box>
          ))}

        {groups.map((group) => (
          <Box key={group.key}>
            <Box sx={styles.dayDivider}>
              <Box sx={styles.dayDividerLabel}>{formatDayDivider(group.key)}</Box>
            </Box>
            {group.items.map((item) =>
              item.kind === 'message' ? (
                <MessageBubble
                  key={item.message.id}
                  message={item.message}
                  isFirst={item.message.id === firstIncomingId}
                  leadCode={chat.leadCode}
                  footer={item.message.byBot ? rateFor(item.message.aiTurnId) : undefined}
                />
              ) : (
                <GhostBubble key={item.id} text={item.text} sentAt={item.at} label={item.label} footer={rateFor(item.turn.id)} />
              ),
            )}
          </Box>
        ))}
      </Box>

      <TurnsJournal accountId={accountId} chatId={chat.id} turns={turns ?? []} />

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
