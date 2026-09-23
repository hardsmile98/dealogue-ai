import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import type { ChatCodeFilter, ChatsQuery } from '@/shared/api'
import { getApiErrorMessage, pluralize, useDebouncedValue, useInfiniteScroll } from '@/shared/lib'
import { useGetChatsInfiniteQuery } from '@/entities/chat'
import { chatListStyles as styles } from './ChatList.styles'
import { ChatListItem } from './ChatListItem'

/** Пауза после ввода, прежде чем искать на сервере. */
const SEARCH_DEBOUNCE_MS = 300
/** Живые обновления приходят по SSE; опрос — страховка на случай обрыва. */
const POLLING_INTERVAL_MS = 60_000

type ChatFilter = 'all' | ChatCodeFilter

const FILTERS: { key: ChatFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'with', label: 'С кодом' },
  { key: 'without', label: 'Без кода' },
]

interface ChatListProps {
  accountId: string
  selectedId: string | null
  onSelect: (chatId: string) => void
}

/** Список диалогов с серверным поиском и догрузкой страниц при прокрутке. */
export function ChatList({ accountId, selectedId, onSelect }: ChatListProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ChatFilter>('all')
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)

  const query: ChatsQuery = {
    accountId,
    search: debouncedSearch || undefined,
    code: filter === 'all' ? undefined : filter,
  }
  const { data, error, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useGetChatsInfiniteQuery(query, { pollingInterval: POLLING_INTERVAL_MS })

  const chats = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])
  const total = data?.pages[0]?.total ?? 0
  const isFiltered = query.search !== undefined || query.code !== undefined

  const { rootRef, sentinelRef } = useInfiniteScroll<HTMLUListElement>({
    hasMore: hasNextPage,
    // Пока перезапрашиваются уже загруженные страницы, новую не начинаем.
    isLoading: isFetching,
    onLoadMore: fetchNextPage,
  })

  return (
    <Box sx={styles.pane}>
      <Box sx={styles.tools}>
        <TextField
          size="small"
          fullWidth
          placeholder="Имя, @username, телефон или текст"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={styles.filterRow}>
          {FILTERS.map((item) => (
            <Chip
              key={item.key}
              size="small"
              label={item.label}
              clickable
              color={filter === item.key ? 'primary' : 'default'}
              variant={filter === item.key ? 'filled' : 'outlined'}
              onClick={() => setFilter(item.key)}
            />
          ))}
        </Box>
      </Box>
      <Box sx={styles.progressSlot}>
        {isFetching && !isLoading && !isFetchingNextPage && <LinearProgress sx={styles.progress} />}
      </Box>

      <List ref={rootRef} disablePadding sx={styles.list}>
        {error && (
          <Alert severity="error" sx={styles.error}>
            {getApiErrorMessage(error, 'Не удалось загрузить чаты')}
          </Alert>
        )}

        {isLoading && <ListSkeleton />}

        {!isLoading && !error && chats.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={styles.message}>
            {isFiltered ? 'Ничего не найдено' : 'Чатов пока нет'}
          </Typography>
        )}

        {chats.map((chat) => (
          <ChatListItem key={chat.id} chat={chat} selected={chat.id === selectedId} onSelect={onSelect} />
        ))}

        {isFetchingNextPage && (
          <Box sx={styles.loadingMore}>
            <CircularProgress size={20} />
          </Box>
        )}
        <div ref={sentinelRef} />
      </List>

      {data && (
        <Box sx={styles.footer}>
          {(isFiltered ? 'Найдено: ' : '') + pluralize(total, ['чат', 'чата', 'чатов'])}
          {chats.length < total && ` · показано ${chats.length}`}
        </Box>
      )}
    </Box>
  )
}

function ListSkeleton() {
  return [0, 1, 2, 3, 4, 5].map((i) => (
    <Box key={i} sx={styles.skeletonRow}>
      <Skeleton variant="circular" width={40} height={40} />
      <Box sx={styles.skeletonText}>
        <Skeleton width="60%" />
        <Skeleton width="90%" />
      </Box>
    </Box>
  ))
}
