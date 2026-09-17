import { useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { connectRealtime, unauthorized } from '@/shared/api'
import type { RealtimeEvent } from '@/shared/api'
import { AI_CHAT_TAG, AI_OVERVIEW_TAG, AI_SETTINGS_TAG, AI_TURNS_TAG, aiAgentApi } from '@/entities/ai-agent'
import { AI_DRAFT_TAG, draftsApi } from '@/entities/ai-draft'
import { ALERT_TAG, alertsApi } from '@/entities/alert'
import { CHAT_TAG, MESSAGE_TAG, chatsApi } from '@/entities/chat'

type ChatTags = Parameters<typeof chatsApi.util.invalidateTags>[0]
type AlertTags = Parameters<typeof alertsApi.util.invalidateTags>[0]
type AgentTags = Parameters<typeof aiAgentApi.util.invalidateTags>[0]
type DraftTags = Parameters<typeof draftsApi.util.invalidateTags>[0]

/** Какие кэши RTK Query устарели после события. */
export function tagsForEvent(event: RealtimeEvent): {
  chats: ChatTags
  alerts: AlertTags
  agent: AgentTags
  drafts?: DraftTags
} {
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
      return { chats: [{ type: CHAT_TAG, id: event.accountId }], alerts: [], agent: [] }
    case 'funnel.updated':
      return {
        chats: [{ type: CHAT_TAG, id: event.accountId }],
        alerts: [],
        agent: [
          { type: AI_CHAT_TAG, id: event.chatId },
          { type: AI_CHAT_TAG, id: event.accountId },
          { type: AI_OVERVIEW_TAG, id: event.accountId },
        ],
      }
    case 'draft.created':
    case 'draft.updated':
      return {
        chats: [{ type: CHAT_TAG, id: event.accountId }],
        alerts: [],
        agent: [
          { type: AI_CHAT_TAG, id: event.chatId },
          { type: AI_CHAT_TAG, id: event.accountId },
          { type: AI_OVERVIEW_TAG, id: event.accountId },
        ],
        drafts: [
          { type: AI_DRAFT_TAG, id: event.accountId },
          { type: AI_DRAFT_TAG, id: 'ALL' },
        ],
      }
    case 'message.created':
      return {
        chats: [
          { type: MESSAGE_TAG, id: event.chatId },
          { type: CHAT_TAG, id: event.accountId },
        ],
        alerts: [],
        agent: [],
      }
    case 'turn.sent':
      return {
        chats: [
          { type: MESSAGE_TAG, id: event.chatId },
          { type: CHAT_TAG, id: event.accountId },
        ],
        alerts: [],
        agent: [
          { type: AI_TURNS_TAG, id: event.chatId },
          { type: AI_CHAT_TAG, id: event.chatId },
          { type: AI_OVERVIEW_TAG, id: event.accountId },
        ],
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
        const { chats, alerts, agent, drafts } = tagsForEvent(event)
        if (chats.length > 0) dispatch(chatsApi.util.invalidateTags(chats))
        if (alerts.length > 0) dispatch(alertsApi.util.invalidateTags(alerts))
        if (agent.length > 0) dispatch(aiAgentApi.util.invalidateTags(agent))
        if (drafts && drafts.length > 0) dispatch(draftsApi.util.invalidateTags(drafts))
        handlerRef.current?.(event)
      },
      setConnected,
      () => dispatch(unauthorized()),
    )
    return () => connection.close()
  }, [dispatch])

  return { connected }
}
