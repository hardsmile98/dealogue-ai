import { API_URL, IS_MOCK_API } from '@/shared/config';
import { getAuthToken } from './authToken';
import type {
  RealtimeEvent,
  RealtimeTicketResponse,
} from './contracts/realtime';

export interface RealtimeConnection {
  close: () => void;
}

export interface RealtimeHandlers {
  onEvent: (event: RealtimeEvent) => void;
  /** Поток открылся (true) или оборвался (false). */
  onStatus?: (connected: boolean) => void;
  /** Сервер не принял токен — переподключаться бессмысленно. */
  onUnauthorized?: () => void;
}

const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

const NOOP_CONNECTION: RealtimeConnection = { close: () => undefined };

function parseEvent(raw: string): RealtimeEvent | null {
  try {
    return JSON.parse(raw) as RealtimeEvent;
  } catch {
    return null;
  }
}

/**
 * SSE-подписка на события сервера. EventSource не умеет заголовки, поэтому
 * сначала берём короткоживущий тикет по обычному запросу с токеном, а затем
 * открываем поток с ним в query. При обрыве переподключаемся с backoff и
 * новым тикетом. Без backend'а (мок-режим) подключаться некуда — ничего не
 * делаем, а не стучимся в пустой URL раз в минуту.
 */
export function connectRealtime({
  onEvent,
  onStatus,
  onUnauthorized,
}: RealtimeHandlers): RealtimeConnection {
  if (IS_MOCK_API) return NOOP_CONNECTION;

  let source: EventSource | null = null;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Запрос тикета, который ещё летит, отменяется при закрытии.
  const abort = new AbortController();

  const schedule = () => {
    if (closed) return;
    const delay =
      Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempt) +
      Math.random() * 1000;
    attempt += 1;
    timer = setTimeout(() => void open(), delay);
  };

  const requestTicket = async (token: string): Promise<string | null> => {
    const response = await fetch(`${API_URL}/realtime/ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: abort.signal,
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(`ticket ${response.status}`);
    return ((await response.json()) as RealtimeTicketResponse).ticket;
  };

  const open = async () => {
    if (closed) return;
    const token = getAuthToken();
    if (!token) {
      schedule();
      return;
    }

    let ticket: string | null;
    try {
      ticket = await requestTicket(token);
    } catch {
      schedule();
      return;
    }
    if (closed) return;
    if (ticket === null) {
      // Токен протух: переподключаться нечем, пока не появится новая сессия.
      closed = true;
      onStatus?.(false);
      onUnauthorized?.();
      return;
    }

    source = new EventSource(
      `${API_URL}/realtime/events?ticket=${encodeURIComponent(ticket)}`,
    );
    source.onopen = () => {
      attempt = 0;
      onStatus?.(true);
    };
    source.onmessage = (message: MessageEvent<string>) => {
      // Битое событие пропускаем, а ошибки обработчика не глушим.
      const event = parseEvent(message.data);
      if (event) onEvent(event);
    };
    source.onerror = () => {
      source?.close();
      source = null;
      onStatus?.(false);
      schedule();
    };
  };

  void open();

  return {
    close: () => {
      closed = true;
      abort.abort();
      if (timer) clearTimeout(timer);
      source?.close();
      source = null;
    },
  };
}
