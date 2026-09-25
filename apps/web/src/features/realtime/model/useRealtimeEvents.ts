import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  BOT_CHAT_TAG,
  BOT_HANDOFFS_TAG,
  CHAT_LIST_TAG,
  MESSAGE_TAG,
  baseApi,
  connectRealtime,
  unauthorized,
} from '@/shared/api';
import type { RealtimeEvent } from '@/shared/api';

type Tags = Parameters<typeof baseApi.util.invalidateTags>[0];

/**
 * Какие кэши RTK Query устарели после события. Сообщение или прочтение в
 * чате меняет и состояние агента: ход, передачу менеджеру, ярлык.
 */
export function tagsForEvent(event: RealtimeEvent): Tags {
  switch (event.type) {
    case 'message.created':
      return [
        { type: MESSAGE_TAG, id: event.chatId },
        { type: CHAT_LIST_TAG, id: event.accountId },
        { type: BOT_CHAT_TAG, id: event.chatId },
        { type: BOT_HANDOFFS_TAG, id: event.accountId },
      ];
    case 'message.read':
      return [
        { type: MESSAGE_TAG, id: event.chatId },
        { type: BOT_CHAT_TAG, id: event.chatId },
        { type: BOT_HANDOFFS_TAG, id: event.accountId },
      ];
    default:
      return [];
  }
}

/** Держит SSE-соединение, пока смонтирован, и превращает события в инвалидацию кэшей. */
export function useRealtimeEvents(): { connected: boolean } {
  const dispatch = useDispatch();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const connection = connectRealtime({
      onEvent: (event) => {
        const tags = tagsForEvent(event);
        if (tags.length > 0) dispatch(baseApi.util.invalidateTags(tags));
      },
      onStatus: setConnected,
      onUnauthorized: () => dispatch(unauthorized()),
    });
    return () => connection.close();
  }, [dispatch]);

  return { connected };
}
