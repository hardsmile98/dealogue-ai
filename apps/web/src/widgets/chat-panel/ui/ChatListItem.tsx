import { memo } from 'react';
import Box from '@mui/material/Box';
import ListItemButton from '@mui/material/ListItemButton';
import Typography from '@mui/material/Typography';
import { formatChatListTime, formatDateTime } from '@/shared/lib';
import { LeadCodeChip } from '@/entities/chat';
import type { Chat } from '@/entities/chat';
import { AccountAvatar } from '@/entities/telegram-account';
import { chatListStyles as styles } from './ChatList.styles';

interface ChatListItemProps {
  chat: Chat;
  selected: boolean;
  onSelect: (chatId: string) => void;
}

/** Строка списка: аватар, имя, время и превью последнего сообщения, код. */
export const ChatListItem = memo(function ChatListItem({
  chat,
  selected,
  onSelect,
}: ChatListItemProps) {
  const { lastMessage } = chat;

  return (
    <li>
      <ListItemButton
        selected={selected}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(chat.id)}
        sx={styles.item}
      >
        <AccountAvatar name={chat.peer.name} size={40} />
        <Box sx={styles.itemBody}>
          <Box sx={styles.itemTop}>
            <Typography sx={styles.peerName}>{chat.peer.name}</Typography>
            <Typography
              component="time"
              dateTime={lastMessage.sentAt}
              title={formatDateTime(lastMessage.sentAt)}
              sx={styles.time}
            >
              {formatChatListTime(lastMessage.sentAt)}
            </Typography>
          </Box>
          <Typography sx={styles.preview}>
            {lastMessage.direction === 'out' && 'Вы: '}
            {lastMessage.text || 'Вложение'}
          </Typography>
          {chat.leadCode !== null && (
            <Box sx={styles.itemBottom}>
              <LeadCodeChip code={chat.leadCode} />
            </Box>
          )}
        </Box>
      </ListItemButton>
    </li>
  );
});
