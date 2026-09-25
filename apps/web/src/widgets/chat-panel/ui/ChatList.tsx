import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import type { ChatCodeFilter, ChatsQuery } from '@/shared/api';
import {
  getApiErrorMessage,
  pluralize,
  useDebouncedValue,
  useInfiniteScroll,
} from '@/shared/lib';
import { EmptyState } from '@/shared/ui';
import { useGetChatsInfiniteQuery } from '@/entities/chat';
import { chatListStyles as styles } from './ChatList.styles';
import { ChatListItem } from './ChatListItem';

/** Пауза после ввода, прежде чем искать на сервере. */
const SEARCH_DEBOUNCE_MS = 300;
/** Живые обновления приходят по SSE; опрос — страховка на случай обрыва. */
const POLLING_INTERVAL_MS = 60_000;

type ChatFilter = 'all' | ChatCodeFilter;

const FILTERS: { key: ChatFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'with', label: 'С кодом' },
  { key: 'without', label: 'Без кода' },
];

interface ChatListProps {
  accountId: string;
  selectedId: string | null;
  onSelect: (chatId: string) => void;
}

/** Список диалогов с серверным поиском и догрузкой страниц при прокрутке. */
export function ChatList({ accountId, selectedId, onSelect }: ChatListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ChatFilter>('all');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const query: ChatsQuery = {
    accountId,
    search: debouncedSearch || undefined,
    code: filter === 'all' ? undefined : filter,
  };
  const {
    data,
    error,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useGetChatsInfiniteQuery(query, { pollingInterval: POLLING_INTERVAL_MS });

  const chats = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total ?? 0;
  const isFiltered = query.search !== undefined || query.code !== undefined;

  const { rootRef, sentinelRef } = useInfiniteScroll<HTMLUListElement>({
    hasMore: hasNextPage,
    // Пока перезапрашиваются уже загруженные страницы, новую не начинаем.
    isLoading: isFetching,
    onLoadMore: fetchNextPage,
  });

  const resetFilters = () => {
    setSearch('');
    setFilter('all');
  };

  return (
    <Box component="nav" aria-label="Чаты аккаунта" sx={styles.pane}>
      <Box sx={styles.tools}>
        <TextField
          size="small"
          fullWidth
          type="search"
          placeholder="Имя, @username, телефон или текст"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Поиск чатов' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={styles.filterRow} role="group" aria-label="Фильтр по коду">
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <Chip
                key={item.key}
                size="small"
                label={item.label}
                clickable
                color={active ? 'primary' : 'default'}
                variant={active ? 'filled' : 'outlined'}
                aria-pressed={active}
                onClick={() => setFilter(item.key)}
              />
            );
          })}
        </Box>
      </Box>
      <Box sx={styles.progressSlot}>
        {isFetching && !isLoading && !isFetchingNextPage && (
          <LinearProgress sx={styles.progress} aria-label="Обновляем список" />
        )}
      </Box>

      <List ref={rootRef} disablePadding sx={styles.list}>
        {error && (
          <Alert
            severity="error"
            sx={styles.error}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => void refetch()}
              >
                Повторить
              </Button>
            }
          >
            {getApiErrorMessage(error, 'Не удалось загрузить чаты')}
          </Alert>
        )}

        {isLoading && <ListSkeleton />}

        {!isLoading && !error && chats.length === 0 && (
          <li>
            {isFiltered ? (
              <EmptyState
                size="compact"
                icon={<SearchOffOutlinedIcon />}
                title="Ничего не найдено"
                description="Поиск идёт по всем чатам аккаунта, а не только по загруженным."
                action={
                  <Button onClick={resetFilters}>Сбросить фильтры</Button>
                }
              />
            ) : (
              <EmptyState
                size="compact"
                icon={<ForumOutlinedIcon />}
                title="Чатов пока нет"
                description="Диалоги появятся, когда аккаунту напишут в Telegram."
              />
            )}
          </li>
        )}

        {chats.map((chat) => (
          <ChatListItem
            key={chat.id}
            chat={chat}
            selected={chat.id === selectedId}
            onSelect={onSelect}
          />
        ))}

        {isFetchingNextPage && (
          <Box component="li" sx={styles.loadingMore}>
            <CircularProgress size={20} aria-label="Загружаем ещё чаты" />
          </Box>
        )}
        <Box component="li" ref={sentinelRef} aria-hidden />
      </List>

      {data && (
        <Box sx={styles.footer} role="status">
          {(isFiltered ? 'Найдено: ' : '') +
            pluralize(total, ['чат', 'чата', 'чатов'])}
          {chats.length < total && ` · показано ${chats.length}`}
        </Box>
      )}
    </Box>
  );
}

function ListSkeleton() {
  return [0, 1, 2, 3, 4, 5].map((i) => (
    <Box component="li" key={i} sx={styles.skeletonRow}>
      <Skeleton variant="circular" width={40} height={40} />
      <Box sx={styles.skeletonText}>
        <Skeleton width="60%" />
        <Skeleton width="90%" />
      </Box>
    </Box>
  ));
}
