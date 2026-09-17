import { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { connectRealtime, unauthorized } from '@/shared/api'
import type { RealtimeEvent } from '@/shared/api'
import { AI_SETTINGS_TAG, aiAgentApi } from '@/entities/ai-agent'
import { ALERT_TAG, alertsApi } from '@/entities/alert'
import { CHAT_TAG, MESSAGE_TAG, chatsApi } from '@/entities/chat'

type ChatTags = Parameters<typeof chatsApi.util.invalidateTags>[0]
type AlertTags = Parameters<typeof alertsApi.util.invalidateTags>[0]
type AgentTags = Parameters<typeof aiAgentApi.util.invalidateTags>[0]

/** Какие кэши RTK Query устарели после события. */
export function tagsForEvent(event: RealtimeEvent): { chats: ChatTags; alerts: AlertTags; agent: AgentTags } {
  switch (event.type) {
    case 'alert.created':
    case 'alert.updated':
      return {
        chats: [{ type: CHAT_TAG, id: event.accountId }],
        alerts: [
          { type: ALERT_TAG, id: 'LIST' },
          { type: ALERT_TAG, id: 'COUNT' },
        ],
        agent: [],
      }
    case 'chat.updated':
    case 'funnel.updated':
      return { chats: [{ type: CHAT_TAG, id: event.accountId }], alerts: [], agent: [] }
    case 'message.created':
    case 'turn.sent':
      return {
        chats: [
          { type: MESSAGE_TAG, id: event.chatId },
          { type: CHAT_TAG, id: event.accountId },
        ],
        alerts: [],
        agent: [],
      }
    case 'message.read':
      return { chats: [{ type: MESSAGE_TAG, id: event.chatId }], alerts: [], agent: [] }
    case 'settings.updated':
      return { chats: [], alerts: [], agent: [{ type: AI_SETTINGS_TAG, id: event.accountId }] }
    default:
      return { chats: [], alerts: [], agent: [] }
  }
}

/**
 * Держит SSE-соединение, пока смонтирован, и превращает события в
 * инвалидацию кэшей. Дополнительный обработчик — для тостов и уведомлений.
 */
export function useRealtimeEvents(onEvent?: (event: RealtimeEvent) => void): { connected: boolean } {
  const dispatch = useDispatch()
  const [connected, setConnected] = useState(false)
  const handlerRef = useRef(onEvent)
  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    const connection = connectRealtime(
      (event) => {
        const { chats, alerts, agent } = tagsForEvent(event)
        if (chats.length > 0) dispatch(chatsApi.util.invalidateTags(chats))
        if (alerts.length > 0) dispatch(alertsApi.util.invalidateTags(alerts))
        if (agent.length > 0) dispatch(aiAgentApi.util.invalidateTags(agent))
        handlerRef.current?.(event)
      },
      setConnected,
      () => dispatch(unauthorized()),
    )
    return () => connection.close()
  }, [dispatch])

  return { connected }
}
