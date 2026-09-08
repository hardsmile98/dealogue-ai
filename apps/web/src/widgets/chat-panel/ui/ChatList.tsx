import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import InputAdornment from '@mui/material/InputAdornment'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import { formatChatListTime, pluralize } from '@/shared/lib'
import { LeadCodeChip } from '@/entities/chat'
import type { Chat } from '@/entities/chat'
import { AccountAvatar } from '@/entities/telegram-account'
import { chatPanelStyles as styles } from './ChatPanel.styles'

type ChatFilter = 'all' | 'with-code' | 'no-code'

const FILTERS: { key: ChatFilter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'with-code', label: 'С кодом' },
  { key: 'no-code', label: 'Без кода' },
]

interface ChatListProps {
  chats: Chat[] | undefined
  isLoading: boolean
  selectedId: string | null
  onSelect: (chatId: string) => void
}

function matchesFilter(chat: Chat, filter: ChatFilter): boolean {
  switch (filter) {
    case 'with-code':
      return chat.leadCode !== null
    case 'no-code':
      return chat.leadCode === null
    default:
      return true
  }
}

function matchesSearch(chat: Chat, query: string): boolean {
  if (!query) return true
  const haystack = [
    chat.peer.name,
    chat.peer.username ?? '',
    chat.peer.phone ?? '',
    chat.lastMessage.text,
    chat.leadCode ? `код ${chat.leadCode}` : '',
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function ChatList({ chats, isLoading, selectedId, onSelect }: ChatListProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ChatFilter>('all')

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (chats ?? []).filter((chat) => matchesFilter(chat, filter) && matchesSearch(chat, query))
  }, [chats, filter, search])

  return (
    <Box sx={styles.listPane}>
      <Box sx={styles.listTools}>
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

      <List disablePadding sx={styles.list}>
        {isLoading &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.5, px: 1.5, py: 1.25 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flexGrow: 1 }}>
                <Skeleton width="60%" />
                <Skeleton width="90%" />
              </Box>
            </Box>
          ))}

        {!isLoading && visible.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            {chats && chats.length > 0 ? 'Ничего не найдено' : 'Чатов пока нет'}
          </Typography>
        )}

        {visible.map((chat) => {
          const outgoing = chat.lastMessage.direction === 'out'
          return (
            <ListItemButton
              key={chat.id}
              selected={chat.id === selectedId}
              onClick={() => onSelect(chat.id)}
              sx={styles.listItem}
            >
              <AccountAvatar name={chat.peer.name} size={40} />
              <Box sx={styles.listItemBody}>
                <Box sx={styles.listItemTop}>
                  <Typography sx={styles.peerName}>{chat.peer.name}</Typography>
                  <Typography sx={styles.time}>
                    {formatChatListTime(chat.lastMessage.sentAt)}
                  </Typography>
                </Box>
                <Typography sx={styles.preview}>
                  {outgoing ? 'Вы: ' : ''}
                  {chat.lastMessage.text}
                </Typography>
                {chat.leadCode !== null && (
                  <Box sx={styles.listItemBottom}>
                    <LeadCodeChip code={chat.leadCode} />
                  </Box>
                )}
              </Box>
            </ListItemButton>
          )
        })}
      </List>

      {chats && (
        <Box sx={styles.listFooter}>
          {visible.length === chats.length
            ? pluralize(chats.length, ['чат', 'чата', 'чатов'])
            : `${visible.length} из ${pluralize(chats.length, ['чата', 'чатов', 'чатов'])}`}
        </Box>
      )}
    </Box>
  )
}
