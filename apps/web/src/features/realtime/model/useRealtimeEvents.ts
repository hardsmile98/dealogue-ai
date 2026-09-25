import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { BOT_CHAT_TAG, CHAT_TAG, MESSAGE_TAG, connectRealtime, unauthorized } from '@/shared/api'
import type { RealtimeEvent } from '@/shared/api'
import { botApi } from '@/entities/bot'
import { chatsApi } from '@/entities/chat'

type ChatTags = Parameters<typeof chatsApi.util.invalidateTags>[0]

/** Какие кэши RTK Query устарели после события. */
export function tagsForEvent(event: RealtimeEvent): ChatTags {
  switch (event.type) {
    case 'message.created':
      return [
        { type: MESSAGE_TAG, id: event.chatId },
        { type: CHAT_TAG, id: event.accountId },
      ]
    case 'message.read':
      return [{ type: MESSAGE_TAG, id: event.chatId }]
    default:
      return []
  }
}

/** Держит SSE-соединение, пока смонтирован, и превращает события в инвалидацию кэшей. */
export function useRealtimeEvents(): { connected: boolean } {
  const dispatch = useDispatch()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const connection = connectRealtime(
      (event) => {
        const tags = tagsForEvent(event)
        if (tags.length > 0) dispatch(chatsApi.util.invalidateTags(tags))
        // Сообщение или прочтение в чате меняет состояние агента: ход, передачу, ярлык.
        if (event.type === 'message.created' || event.type === 'message.read') {
          dispatch(
            botApi.util.invalidateTags([
              { type: BOT_CHAT_TAG, id: event.chatId },
              { type: BOT_CHAT_TAG, id: `handoffs-${event.accountId}` },
            ]),
          )
        }
      },
      setConnected,
      () => dispatch(unauthorized()),
    )
    return () => connection.close()
  }, [dispatch])

  return { connected }
}
