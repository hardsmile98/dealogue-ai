import { useEffect, useId, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { SandboxMessageDto } from '@/shared/api';
import {
  formatDateTime,
  formatDuration,
  formatTime,
  joinParts,
} from '@/shared/lib';
import { ChatBubble, ReadReceipt } from '@/shared/ui';
import { MediaTag } from '@/entities/chat';
import { sandboxFeedStyles as styles } from './SandboxFeed.styles';

/** Длинные тела вех (диагностика, услуги, цены) свёрнуты — в ленте важен разговор вокруг них. */
const COLLAPSE_LENGTH = 400;

/** «пауза 3 мин · печатал 15 с» — задержки агента в виртуальном времени. */
function describeTiming(message: SandboxMessageDto): string {
  return joinParts([
    message.delayMs !== null && `пауза ${formatDuration(message.delayMs)}`,
    Boolean(message.typingMs) &&
      `печатал ${formatDuration(message.typingMs ?? 0)}`,
  ]);
}

function SandboxBubble({ message }: { message: SandboxMessageDto }) {
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const collapsible = message.block && message.text.length > COLLAPSE_LENGTH;
  const timing = describeTiming(message);
  const header =
    message.block || message.mediaKind ? (
      <>
        {message.block && (
          <Box component="span" sx={styles.milestoneBadge}>
            Веха из библиотеки
          </Box>
        )}
        {message.mediaKind && <MediaTag kind={message.mediaKind} />}
      </>
    ) : null;

  return (
    <ChatBubble
      direction={message.direction}
      tone={message.block ? 'milestone' : 'default'}
      header={header}
      metaTitle={formatDateTime(message.sentAt)}
      meta={
        <>
          {timing && <span>{timing}</span>}
          <span>{formatTime(message.sentAt)}</span>
          {message.direction === 'out' && (
            <ReadReceipt readAt={message.readAt} />
          )}
        </>
      }
    >
      <Box
        id={textId}
        sx={collapsible && !expanded ? styles.collapsed : undefined}
      >
        {message.text}
      </Box>
      {collapsible && (
        <Button
          size="small"
          sx={styles.expand}
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Свернуть' : 'Показать целиком'}
        </Button>
      )}
    </ChatBubble>
  );
}

interface SandboxFeedProps {
  messages: SandboxMessageDto[];
}

/** Переписка песочницы; время — виртуальное, задержки агента подписаны числом. */
export function SandboxFeed({ messages }: SandboxFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;

  // Новое сообщение — ленту вниз, как в мессенджере.
  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [lastId]);

  return (
    <Box
      ref={feedRef}
      sx={styles.feed}
      role="log"
      aria-label="Переписка песочницы"
    >
      {messages.length === 0 ? (
        <Box sx={styles.empty}>
          Напишите первое сообщение за клиента — например, «Здравствуйте! Хочу
          бесплатный расклад, код 12» — и нажмите «Ответить агентом».
        </Box>
      ) : (
        messages.map((message) => (
          <SandboxBubble key={message.id} message={message} />
        ))
      )}
    </Box>
  );
}
