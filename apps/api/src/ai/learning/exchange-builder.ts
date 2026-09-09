import type { MessageDirection } from '../../telegram/entities/telegram-chat.entity.js';

/** Минимум, что нужно знать о сообщении, чтобы собрать обмены. */
export interface ExchangeSourceMessage {
  telegramMessageId: number;
  direction: MessageDirection;
  text: string;
  sentAt: Date;
  aiRunId: string | null;
}

export interface BuiltExchange {
  clientMessageId: number;
  clientText: string;
  managerText: string;
  managerParts: number;
  clientAt: Date;
  managerAt: Date;
  delaySec: number;
  quality: number;
}

/** Медиа-заглушки вида «[Фото]», «[Голосовое сообщение]». */
export const MEDIA_PLACEHOLDER_RE = /^\[[^\]]+\]$/;

/** Ответ менеджера спустя сутки и больше — уже не «ответ», а новое касание. */
const MAX_REPLY_DELAY_SEC = 24 * 3600;

/**
 * Режет историю чата на пары «блок сообщений клиента → блок ответов
 * менеджера». Блоки, где хотя бы одно сообщение написал ИИ, пропускаются:
 * ИИ не должен учиться сам на себе.
 */
export function buildExchanges(messages: ExchangeSourceMessage[]): BuiltExchange[] {
  const sorted = [...messages].sort(
    (a, b) => a.sentAt.getTime() - b.sentAt.getTime() || a.telegramMessageId - b.telegramMessageId,
  );
  const result: BuiltExchange[] = [];
  let i = 0;
  while (i < sorted.length) {
    // Пропускаем исходящие без предшествующего входящего блока.
    if (sorted[i].direction !== 'in') {
      i += 1;
      continue;
    }
    const clientBlock: ExchangeSourceMessage[] = [];
    while (i < sorted.length && sorted[i].direction === 'in') {
      clientBlock.push(sorted[i]);
      i += 1;
    }
    const managerBlock: ExchangeSourceMessage[] = [];
    while (i < sorted.length && sorted[i].direction === 'out') {
      managerBlock.push(sorted[i]);
      i += 1;
    }
    if (managerBlock.length === 0) continue;
    if (managerBlock.some((m) => m.aiRunId !== null)) continue;

    const clientAt = clientBlock[clientBlock.length - 1].sentAt;
    const managerAt = managerBlock[0].sentAt;
    const delaySec = Math.max(0, Math.round((managerAt.getTime() - clientAt.getTime()) / 1000));
    const clientText = joinTexts(clientBlock);
    const managerText = joinTexts(managerBlock);

    result.push({
      clientMessageId: clientBlock[0].telegramMessageId,
      clientText,
      managerText,
      managerParts: managerBlock.length,
      clientAt,
      managerAt,
      delaySec,
      quality: qualityOf(clientText, managerText, delaySec),
    });
  }
  return result;
}

function joinTexts(block: ExchangeSourceMessage[]): string {
  return block
    .map((m) => m.text.trim())
    .filter(Boolean)
    .join('\n');
}

/** 0 — мусор, 1 — обычный, 2 — показательный обмен. */
export function qualityOf(clientText: string, managerText: string, delaySec: number): number {
  const clientLines = clientText.split('\n').filter((line) => !MEDIA_PLACEHOLDER_RE.test(line.trim()));
  const managerLines = managerText.split('\n').filter((line) => !MEDIA_PLACEHOLDER_RE.test(line.trim()));
  const clientLen = clientLines.join(' ').trim().length;
  const managerLen = managerLines.join(' ').trim().length;
  if (clientLen < 3 || managerLen < 8) return 0;
  if (delaySec > MAX_REPLY_DELAY_SEC) return 0;
  if (clientLen >= 15 && managerLen >= 40) return 2;
  return 1;
}
