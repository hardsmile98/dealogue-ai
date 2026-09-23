import { useMemo } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Skeleton from '@mui/material/Skeleton'
import { formatDayDivider, getApiErrorMessage, useInfiniteScroll } from '@/shared/lib'
import { MessageBubble, useGetMessagesInfiniteQuery } from '@/entities/chat'
import type { Chat } from '@/entities/chat'
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
}

/**
 * Переписка по дням. Как в Telegram: открыли чат — видим свежие сообщения,
 * листаем вверх — подгружаются более старые страницы.
 */
export function MessageFeed({ accountId, chatId, chat }: MessageFeedProps) {
  const { data, error, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useGetMessagesInfiniteQuery({ accountId, chatId }, { pollingInterval: POLLING_INTERVAL_MS })

  // Страницы идут от свежей к старым, сообщения внутри страницы — по времени.
  const messages = useMemo(() => (data ? [...data.pages].reverse().flatMap((page) => page.items) : []), [data])
  const groups = useMemo(() => groupByDay(messages), [messages])

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
          {group.messages.map((message) => (
            <div key={message.id} {...{ [MESSAGE_ANCHOR_ATTR]: message.id }}>
              <MessageBubble
                message={message}
                isFirst={isFirstMessage(message.telegramMessageId, message.direction)}
                leadCode={chat?.leadCode ?? null}
              />
            </div>
          ))}
        </Box>
      ))}
    </Box>
  )
}
