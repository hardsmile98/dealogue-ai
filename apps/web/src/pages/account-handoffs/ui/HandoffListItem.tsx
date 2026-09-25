import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import ListItemButton from '@mui/material/ListItemButton';
import Typography from '@mui/material/Typography';
import type { HandoffChatDto } from '@/shared/api';
import { accountLinks } from '@/shared/config';
import { formatDateTime, formatRelative } from '@/shared/lib';
import {
  CHAT_LABEL_LABELS,
  HANDOFF_REASON_LABELS,
  StageChip,
} from '@/entities/bot';
import { AccountAvatar } from '@/entities/telegram-account';
import { accountHandoffsStyles as styles } from './AccountHandoffsPage.styles';

interface HandoffListItemProps {
  accountId: string;
  chat: HandoffChatDto;
}

/** Чат у менеджера: кто, ярлык, последнее сообщение, этап, причина и сколько ждёт. */
export function HandoffListItem({ accountId, chat }: HandoffListItemProps) {
  return (
    <ListItemButton
      component={RouterLink}
      to={accountLinks.chat(accountId, chat.chatId)}
      sx={styles.item}
    >
      <AccountAvatar name={chat.peerName} size={36} />
      <Box sx={styles.text}>
        <Box sx={styles.titleRow}>
          <Typography sx={styles.name}>{chat.peerName}</Typography>
          {chat.label && (
            <Chip
              size="small"
              color={chat.label === 'prices_silent' ? 'default' : 'warning'}
              label={CHAT_LABEL_LABELS[chat.label]}
            />
          )}
        </Box>
        <Typography sx={styles.last}>
          {chat.lastMessageDirection === 'out' ? 'Вы: ' : ''}
          {chat.lastMessageText || '—'}
        </Typography>
        <Box sx={styles.meta}>
          <StageChip stage={chat.stage} />
          {chat.handoffReason && (
            <span>{HANDOFF_REASON_LABELS[chat.handoffReason]}</span>
          )}
          {chat.waitingSince && (
            <Box
              component="span"
              sx={styles.waiting}
              title={formatDateTime(chat.waitingSince)}
            >
              клиент написал {formatRelative(chat.waitingSince)}
            </Box>
          )}
        </Box>
      </Box>
    </ListItemButton>
  );
}
