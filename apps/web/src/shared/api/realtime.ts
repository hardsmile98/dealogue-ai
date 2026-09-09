import { API_URL } from '@/shared/config'
import { getAuthToken } from './authToken'
import type { RealtimeEvent, RealtimeTicketResponse } from './contracts/realtime'

export interface RealtimeConnection {
  close: () => void
}

const RECONNECT_MIN_MS = 2_000
const RECONNECT_MAX_MS = 60_000

/**
 * SSE-подписка на события сервера. EventSource не умеет заголовки, поэтому
 * сначала берём короткоживущий тикет по обычному запросу с токеном, а затем
 * открываем поток с ним в query. При обрыве переподключаемся с backoff и
 * новым тикетом.
 */
export function connectRealtime(
  onEvent: (event: RealtimeEvent) => void,
  onStatus?: (connected: boolean) => void,
): RealtimeConnection {
  let source: EventSource | null = null
  let closed = false
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (closed) return
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempt) + Math.random() * 1000
    attempt += 1
    timer = setTimeout(() => void open(), delay)
  }

  const open = async () => {
    if (closed) return
    const token = getAuthToken()
    if (!token || !API_URL) {
      schedule()
      return
    }
    let ticket: string
    try {
      const response = await fetch(`${API_URL}/realtime/ticket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`ticket ${response.status}`)
      ticket = ((await response.json()) as RealtimeTicketResponse).ticket
    } catch {
      schedule()
      return
    }
    if (closed) return

    source = new EventSource(`${API_URL}/realtime/events?ticket=${encodeURIComponent(ticket)}`)
    source.onopen = () => {
      attempt = 0
      onStatus?.(true)
    }
    source.onmessage = (message: MessageEvent<string>) => {
      try {
        onEvent(JSON.parse(message.data) as RealtimeEvent)
      } catch {
        // битое событие — пропускаем
      }
    }
    source.onerror = () => {
      source?.close()
      source = null
      onStatus?.(false)
      schedule()
    }
  }

  void open()

  return {
    close: () => {
      closed = true
      if (timer) clearTimeout(timer)
      source?.close()
      source = null
    },
  }
}
