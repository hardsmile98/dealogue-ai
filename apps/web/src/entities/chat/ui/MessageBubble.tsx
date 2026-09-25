import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import { formatDateTime, formatTime } from '@/shared/lib';
import { ChatBubble, ReadReceipt } from '@/shared/ui';
import type { Message } from '../model/types';
import { LeadCodeChip } from './LeadCodeChip';
import { MediaTag } from './MediaTag';
import { messageBubbleStyles as styles } from './MessageBubble.styles';

interface MessageBubbleProps {
  message: Message;
  /** Первое входящее сообщение диалога — по нему считается статистика. */
  isFirst?: boolean;
  leadCode?: string | null;
  /** Действия у сообщения (видны при наведении): «продолжить в песочнице», «в примеры». */
  actions?: ReactNode;
  /** Постоянная пометка в строке времени: например, «ответ агента». */
  marker?: ReactNode;
}

/** Сообщение переписки Telegram: текст, вложение, время и прочтение. */
export function MessageBubble({
  message,
  isFirst = false,
  leadCode = null,
  actions,
  marker,
}: MessageBubbleProps) {
  const header =
    isFirst || message.mediaKind ? (
      <>
        {isFirst && (
          <Box component="span" sx={styles.firstBadge}>
            <Box component="span" sx={styles.firstBadgeLabel}>
              Первое сообщение
            </Box>
            <LeadCodeChip code={leadCode} showEmpty />
          </Box>
        )}
        {message.mediaKind && <MediaTag kind={message.mediaKind} />}
      </>
    ) : null;

  return (
    <ChatBubble
      direction={message.direction}
      header={header}
      actions={actions}
      metaTitle={formatDateTime(message.sentAt)}
      meta={
        <>
          {marker}
          <span>{formatTime(message.sentAt)}</span>
          {message.direction === 'out' && (
            <ReadReceipt readAt={message.readAt} />
          )}
        </>
      }
    >
      {message.text}
    </ChatBubble>
  );
}
