import { useCallback, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Ближе этого к низу — человек читает свежее, и лента докручивается за новыми сообщениями. */
const STICK_TO_BOTTOM_PX = 80;

/** Атрибут обёртки каждого сообщения — по нему лента находит, что сейчас на экране. */
export const MESSAGE_ANCHOR_ATTR = 'data-message-id';

interface Anchor {
  messageId: string;
  /** Расстояние от верха ленты до верха сообщения. */
  top: number;
}

/**
 * Прокрутка переписки как в мессенджере. Внизу лента держится низа и
 * докручивается за новыми сообщениями. Выше — на месте остаётся первое
 * видимое сообщение, что бы ни поменялось вокруг: подгрузились старые
 * сверху, пришли новые снизу, перезапрос сдвинул границы страниц.
 *
 * Положение запоминается при прокрутке и после каждого рендера, а
 * восстанавливается сразу после коммита, до отрисовки, — без мигания.
 * Возвращает обработчик `onScroll` для ленты.
 */
export function useFeedScroll(
  feedRef: RefObject<HTMLElement | null>,
): () => void {
  const stickToBottom = useRef(true);
  const anchor = useRef<Anchor | null>(null);

  const remember = useCallback(() => {
    const feed = feedRef.current;
    if (!feed) return;
    stickToBottom.current =
      feed.scrollHeight - feed.scrollTop - feed.clientHeight <
      STICK_TO_BOTTOM_PX;
    anchor.current = firstVisible(feed);
  }, [feedRef]);

  // Без зависимостей: любое изменение ленты — страница, спиннер, новое
  // сообщение — проходит через эту точку.
  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    if (stickToBottom.current) {
      feed.scrollTop = feed.scrollHeight;
    } else if (anchor.current) {
      const element = feed.querySelector<HTMLElement>(
        `[${MESSAGE_ANCHOR_ATTR}="${anchor.current.messageId}"]`,
      );
      if (element)
        feed.scrollTop += topWithin(feed, element) - anchor.current.top;
    }
    remember();
  });

  return remember;
}

/** Первое сообщение, хотя бы частично видимое в ленте. Сообщения идут сверху вниз — ищем делением пополам. */
function firstVisible(feed: HTMLElement): Anchor | null {
  const messages = feed.querySelectorAll<HTMLElement>(
    `[${MESSAGE_ANCHOR_ATTR}]`,
  );
  const feedTop = feed.getBoundingClientRect().top;
  let low = 0;
  let high = messages.length - 1;
  let found: HTMLElement | null = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const message = messages.item(middle);
    if (message.getBoundingClientRect().bottom > feedTop) {
      found = message;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  const messageId = found?.getAttribute(MESSAGE_ANCHOR_ATTR);
  return found && messageId ? { messageId, top: topWithin(feed, found) } : null;
}

function topWithin(feed: HTMLElement, element: HTMLElement): number {
  return element.getBoundingClientRect().top - feed.getBoundingClientRect().top;
}
