import { useCallback, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import {
  formatDayDivider,
  getApiErrorMessage,
  useInfiniteScroll,
} from '@/shared/lib';
import {
  useGetChatBotStateQuery,
  useGetChatJournalQuery,
} from '@/entities/bot';
import { MessageBubble, useGetMessagesInfiniteQuery } from '@/entities/chat';
import type { Chat, Message } from '@/entities/chat';
import { AddExampleDialog } from '@/features/bot-examples';
import type { ExampleDraft } from '@/features/bot-examples';
import { useContinueInSandbox } from '@/features/bot-sandbox';
import { clientBefore } from '../lib/clientBefore';
import { groupByDay } from '../lib/groupByDay';
import { MESSAGE_ANCHOR_ATTR, useFeedScroll } from '../lib/useFeedScroll';
import { chatThreadStyles as styles } from './ChatThread.styles';
import { AgentTurnMarker, MessageActions } from './MessageActions';

/** Живые обновления приходят по SSE; опрос — страховка на случай обрыва. */
const POLLING_INTERVAL_MS = 30_000;

interface MessageFeedProps {
  accountId: string;
  chatId: string;
  /** undefined — чат ещё грузится; нужен, чтобы пометить первое сообщение диалога. */
  chat: Chat | undefined;
  /** Клик по пометке «ответ агента» — открыть его ход в журнале. */
  onOpenTurn: (turnId: string) => void;
}

/** Какой ход агента отправил сообщение: telegram_message_id → id хода. */
function useAgentTurns(accountId: string, chatId: string): Map<number, string> {
  const { data: journal } = useGetChatJournalQuery({ accountId, chatId });
  return useMemo(() => {
    const byMessage = new Map<number, string>();
    for (const turn of journal?.journal?.turns ?? []) {
      for (const id of turn.messageIds) byMessage.set(id, turn.id);
    }
    return byMessage;
  }, [journal]);
}

/**
 * Переписка по дням. Как в Telegram: открыли чат — видим свежие сообщения,
 * листаем вверх — подгружаются более старые страницы.
 */
export function MessageFeed({
  accountId,
  chatId,
  chat,
  onOpenTurn,
}: MessageFeedProps) {
  const {
    data,
    error,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useGetMessagesInfiniteQuery(
    { accountId, chatId },
    { pollingInterval: POLLING_INTERVAL_MS },
  );

  // Страницы идут от свежей к старым, сообщения внутри страницы — по времени.
  const messages = useMemo(
    () => (data ? [...data.pages].reverse().flatMap((page) => page.items) : []),
    [data],
  );
  const groups = useMemo(() => groupByDay(messages), [messages]);

  const agentTurns = useAgentTurns(accountId, chatId);
  const { data: botState } = useGetChatBotStateQuery({ accountId, chatId });
  const stage = botState?.state?.stage ?? 'intake';

  const { continueFrom, isLoading: copying } = useContinueInSandbox({
    accountId,
    chatId,
  });
  const [exampleDraft, setExampleDraft] = useState<ExampleDraft | null>(null);

  const toSandbox = useCallback(
    (messageId: string) => {
      const message = messages.find((item) => item.id === messageId);
      if (message) void continueFrom(message.telegramMessageId);
    },
    [messages, continueFrom],
  );

  const toExamples = useCallback(
    (messageId: string) => {
      const index = messages.findIndex((item) => item.id === messageId);
      const message = messages[index];
      if (!message) return;
      setExampleDraft({
        client: clientBefore(messages, index),
        practitioner: message.text,
        stage,
      });
    },
    [messages, stage],
  );

  const { rootRef: feedRef, sentinelRef } = useInfiniteScroll<HTMLDivElement>({
    edge: 'top',
    hasMore: hasNextPage,
    // Пока перезапрашиваются уже загруженные страницы, старше не лезем.
    isLoading: isFetching,
    onLoadMore: fetchNextPage,
  });
  const onScroll = useFeedScroll(feedRef);

  const isFirstMessage = (message: Message) =>
    message.direction === 'in' &&
    message.telegramMessageId === chat?.firstTelegramMessageId;

  return (
    <Box
      ref={feedRef}
      sx={styles.feed}
      onScroll={onScroll}
      role="log"
      aria-label="Переписка"
      aria-busy={isLoading || isFetchingNextPage}
    >
      <div ref={sentinelRef} />
      {isFetchingNextPage && (
        <Box sx={styles.loadingOlder}>
          <CircularProgress size={20} aria-label="Загружаем старые сообщения" />
        </Box>
      )}

      {error && (
        <Alert
          severity="error"
          sx={styles.feedError}
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Повторить
            </Button>
          }
        >
          {getApiErrorMessage(error, 'Не удалось загрузить сообщения')}
        </Alert>
      )}

      {isLoading && <FeedSkeleton />}

      {groups.map((group) => (
        <Box key={group.day} component="section">
          <Box sx={styles.dayDivider}>
            <Box component="h3" sx={styles.dayDividerLabel}>
              {formatDayDivider(group.day)}
            </Box>
          </Box>
          {group.messages.map((message) => {
            const turnId =
              message.direction === 'out'
                ? agentTurns.get(message.telegramMessageId)
                : undefined;
            return (
              <div key={message.id} {...{ [MESSAGE_ANCHOR_ATTR]: message.id }}>
                <MessageBubble
                  message={message}
                  isFirst={isFirstMessage(message)}
                  leadCode={chat?.leadCode ?? null}
                  marker={
                    turnId && (
                      <AgentTurnMarker turnId={turnId} onOpen={onOpenTurn} />
                    )
                  }
                  actions={
                    <MessageActions
                      messageId={message.id}
                      outgoing={message.direction === 'out'}
                      onToSandbox={toSandbox}
                      onToExamples={toExamples}
                      disabled={copying}
                    />
                  }
                />
              </div>
            );
          })}
        </Box>
      ))}

      <AddExampleDialog
        accountId={accountId}
        draft={exampleDraft}
        onClose={() => setExampleDraft(null)}
      />
    </Box>
  );
}

function FeedSkeleton() {
  return [0, 1, 2, 3].map((i) => (
    <Box
      key={i}
      sx={[styles.skeletonRow, i % 2 ? styles.skeletonOut : styles.skeletonIn]}
    >
      <Skeleton variant="rounded" width={`${40 + (i % 3) * 12}%`} height={48} />
    </Box>
  ));
}
