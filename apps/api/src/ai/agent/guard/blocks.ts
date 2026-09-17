/**
 * Маркеры блоков `[[BLOCK:kind]]`: модель ставит маркер, код подставляет
 * дословный текст и режет его на сообщения Telegram (раздел 4.2 ТЗ).
 */

import { splitIntoMessages } from '../../library/lib/split-messages.js';
import type { ComposedMessage, LibraryBlock } from '../agent.types.js';

export const BLOCK_MARKER_RE = /\[\[\s*BLOCK\s*:\s*([a-z0-9_.-]+)\s*\]\]/gi;

export interface MessageSegment {
  text: string;
  /** Вид блока, если сегмент — маркер. */
  blockKind: string | null;
}

/**
 * Разбивает сырые сообщения модели на сегменты: обычный текст и маркеры.
 * Маркер внутри текста становится отдельным сообщением — так блок
 * всегда уходит целиком и дословно.
 */
export function expandMarkers(rawMessages: string[]): MessageSegment[] {
  const segments: MessageSegment[] = [];
  for (const raw of rawMessages) {
    let cursor = 0;
    const text = raw ?? '';
    BLOCK_MARKER_RE.lastIndex = 0;
    let match = BLOCK_MARKER_RE.exec(text);
    while (match) {
      const before = text.slice(cursor, match.index).trim();
      if (before) segments.push({ text: before, blockKind: null });
      segments.push({ text: match[0], blockKind: match[1].toLowerCase() });
      cursor = match.index + match[0].length;
      match = BLOCK_MARKER_RE.exec(text);
    }
    const rest = text.slice(cursor).trim();
    if (rest) segments.push({ text: rest, blockKind: null });
  }
  return segments;
}

export interface ResolvedBlocks {
  messages: ComposedMessage[];
  /** Маркеры, для которых блока нет. */
  unknownKinds: string[];
}

/** Подставляет тексты блоков и режет их на сообщения; неизвестные маркеры выбрасывает. */
export function resolveBlocks(segments: MessageSegment[], blocks: LibraryBlock[]): ResolvedBlocks {
  const messages: ComposedMessage[] = [];
  const unknownKinds: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    if (!segment.blockKind) {
      messages.push({ text: segment.text, blockKind: null, blockId: null });
      continue;
    }
    const block = blocks.find((item) => item.kind === segment.blockKind);
    if (!block) {
      unknownKinds.push(segment.blockKind);
      continue;
    }
    // Один и тот же блок дважды в одном ходе — оставляем первое вхождение.
    if (seen.has(block.kind)) continue;
    seen.add(block.kind);
    for (const part of splitIntoMessages(block.text)) {
      messages.push({ text: part, blockKind: block.kind, blockId: block.id });
    }
  }
  return { messages, unknownKinds };
}

/** Сообщения хода одной строкой для журнала и черновиков. */
export function joinMessages(messages: ComposedMessage[]): string {
  return messages.map((m) => m.text).join('\n\n---\n\n');
}
