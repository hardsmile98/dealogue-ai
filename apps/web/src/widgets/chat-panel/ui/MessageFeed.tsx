import { useMemo } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Skeleton from '@mui/material/Skeleton'
import { formatDayDivider, getApiErrorMessage, useInfiniteScroll } from '@/shared/lib'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import { useGetChatBotStateQuery, useGetChatJournalQuery } from '@/entities/bot'
import { MessageBubble, useGetMessagesInfiniteQuery } from '@/entities/chat'
import type { Chat, Message } from '@/entities/chat'
import { ToSandboxButton } from '@/features/bot-sandbox'
import { AddExampleButton } from '@/features/bot-examples'
import { groupByDay } from '../lib/groupByDay'
import { MESSAGE_ANCHOR_ATTR, useFeedScroll } from '../lib/useFeedScroll'
import { chatThreadStyles as styles } from './ChatThread.styles'

/** Живые обновления приходят по SSE; опрос — страховка на случай обрыва. */
const POLLING_INTERVAL_MS = 30_000

interface MessageFeedProps {
  accountId: string
  chatId: string
  /** undefined — чат ещё грузится; нужен, чтобы пометить первое сообщение диалога. */
  chat: Chat | undefined
  /** Клик по пометке «ответ агента» — открыть его ход в журнале. */
  onOpenTurn: (turnId: string) => void
}

/** Сообщения клиента подряд перед ответом — «что написал клиент» для примера. */
function clientBefore(messages: readonly Message[], index: number): string {
  const parts: string[] = []
  for (let i = index - 1; i >= 0; i -= 1) {
    const message = messages[i] as Message
    if (message.direction === 'out') {
      if (parts.length > 0) break
      continue
    }
    parts.unshift(message.text)
  }
  return parts.join('\n')
}

/**
 * Переписка по дням. Как в Telegram: открыли чат — видим свежие сообщения,
 * листаем вверх — подгружаются более старые страницы.
 */
export function MessageFeed({ accountId, chatId, chat, onOpenTurn }: MessageFeedProps) {
  const { data, error, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useGetMessagesInfiniteQuery({ accountId, chatId }, { pollingInterval: POLLING_INTERVAL_MS })

  // Страницы идут от свежей к старым, сообщения внутри страницы — по времени.
  const messages = useMemo(() => (data ? [...data.pages].reverse().flatMap((page) => page.items) : []), [data])
  const groups = useMemo(() => groupByDay(messages), [messages])

  // Какие сообщения отправил агент и каким ходом — из журнала.
  const { data: journal } = useGetChatJournalQuery({ accountId, chatId })
  const { data: botState } = useGetChatBotStateQuery({ accountId, chatId })
  const agentTurns = useMemo(() => {
    const byMessage = new Map<number, string>()
    for (const turn of journal?.journal?.turns ?? []) for (const id of turn.messageIds) byMessage.set(id, turn.id)
    return byMessage
  }, [journal])
  const positions = useMemo(() => new Map(messages.map((message, index) => [message.id, index])), [messages])
  const stage = botState?.state?.stage ?? 'intake'

  const { rootRef: feedRef, sentinelRef } = useInfiniteScroll<HTMLDivElement>({
    edge: 'top',
    hasMore: hasNextPage,
    // Пока перезапрашиваются уже загруженные страницы, старше не лезем.
    isLoading: isFetching,
    onLoadMore: fetchNextPage,
  })
  const onScroll = useFeedScroll(feedRef)

  const isFirstMessage = (telegramMessageId: number, direction: 'in' | 'out') =>
    direction === 'in' && telegramMessageId === chat?.firstTelegramMessageId

  return (
    <Box ref={feedRef} sx={styles.feed} onScroll={onScroll}>
      <div ref={sentinelRef} />
      {isFetchingNextPage && (
        <Box sx={styles.loadingOlder}>
          <CircularProgress size={20} />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={styles.feedError}>
          {getApiErrorMessage(error, 'Не удалось загрузить сообщения')}
        </Alert>
      )}

      {isLoading &&
        [0, 1, 2, 3].map((i) => (
          <Box key={i} sx={[styles.skeletonRow, { justifyContent: i % 2 ? 'flex-end' : 'flex-start' }]}>
            <Skeleton variant="rounded" width={`${40 + (i % 3) * 12}%`} height={48} />
          </Box>
        ))}

      {groups.map((group) => (
        <Box key={group.day}>
          <Box sx={styles.dayDivider}>
            <Box sx={styles.dayDividerLabel}>{formatDayDivider(group.day)}</Box>
          </Box>
          {group.messages.map((message) => {
            const turnId = message.direction === 'out' ? agentTurns.get(message.telegramMessageId) : undefined
            return (
              <div key={message.id} {...{ [MESSAGE_ANCHOR_ATTR]: message.id }}>
                <MessageBubble
                  message={message}
                  isFirst={isFirstMessage(message.telegramMessageId, message.direction)}
                  leadCode={chat?.leadCode ?? null}
                  marker={
                    turnId && (
                      <Tooltip title="Ответ агента — открыть ход в журнале">
                        <IconButton size="small" aria-label="Ход агента" sx={{ p: 0.25 }} onClick={() => onOpenTurn(turnId)}>
                          <SmartToyOutlinedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    )
                  }
                  action={
                    <>
                      <ToSandboxButton accountId={accountId} chatId={chatId} messageId={message.telegramMessageId} compact />
                      {message.direction === 'out' && (
                        <AddExampleButton
                          accountId={accountId}
                          client={clientBefore(messages, positions.get(message.id) ?? 0)}
                          practitioner={message.text}
                          stage={stage}
                        />
                      )}
                    </>
                  }
                />
              </div>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}
