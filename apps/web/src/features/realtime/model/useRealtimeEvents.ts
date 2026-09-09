import { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { connectRealtime } from '@/shared/api'
import type { RealtimeEvent } from '@/shared/api'
import { AI_LEARNING_TAG, AI_RUNS_TAG, aiAgentApi } from '@/entities/ai-agent'
import { ALERT_TAG, alertsApi } from '@/entities/alert'
import { CHAT_TAG, MESSAGE_TAG } from '@/entities/chat'

type AgentTags = Parameters<typeof aiAgentApi.util.invalidateTags>[0]
type AlertTags = Parameters<typeof alertsApi.util.invalidateTags>[0]

/** Какие кэши RTK Query устарели после события. */
export function tagsForEvent(event: RealtimeEvent): { agent: AgentTags; alerts: AlertTags } {
  switch (event.type) {
    case 'alert.created':
    case 'alert.updated':
      return {
        agent: [{ type: CHAT_TAG, id: event.accountId }],
        alerts: [
          { type: ALERT_TAG, id: 'LIST' },
          { type: ALERT_TAG, id: 'COUNT' },
        ],
      }
    case 'chat.updated':
      return { agent: [{ type: CHAT_TAG, id: event.accountId }], alerts: [] }
    case 'message.created':
      return {
        agent: [
          { type: MESSAGE_TAG, id: event.chatId },
          { type: CHAT_TAG, id: event.accountId },
        ],
        alerts: [],
      }
    case 'ai.run':
      return { agent: [{ type: AI_RUNS_TAG, id: event.chatId }], alerts: [] }
    case 'learning.progress':
      return { agent: [{ type: AI_LEARNING_TAG, id: event.accountId }], alerts: [] }
    default:
      return { agent: [], alerts: [] }
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
        const { agent, alerts } = tagsForEvent(event)
        if (agent.length > 0) dispatch(aiAgentApi.util.invalidateTags(agent))
        if (alerts.length > 0) dispatch(alertsApi.util.invalidateTags(alerts))
        handlerRef.current?.(event)
      },
      setConnected,
    )
    return () => connection.close()
  }, [dispatch])

  return { connected }
}
