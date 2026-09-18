/**
 * Guard (раздел 4.3 ТЗ): проверки ответа модели кодом. Нарушение →
 * регенерация с замечанием; повторное приветствие в тот же день
 * чинится автоправкой без регенерации.
 */

import type { GuardConfig } from '../../domain/types.js';
import { hasQuestion, startsWithGreeting, stripLeadingGreeting } from '../lib/reply-text.js';
import { maxSimilarity } from '../lib/similarity.js';
import type { ComposedMessage, GuardViolation, LibraryBlock } from '../agent.types.js';

export interface Allowlists {
  /** Числа (без пробелов), встречающиеся в фактах и блоках. */
  numbers: Set<string>;
  /** Нормализованные адреса из фактов, ссылок персоны и блоков. */
  urls: Set<string>;
}

export interface GuardInput {
  messages: ComposedMessage[];
  /** Маркеры, для которых блока не нашлось. */
  unknownBlockKinds: string[];
  /** Виды блоков, уже отправленные в чате (маркер → «не повторяй»). */
  exhaustedBlockKinds?: string[];
  requiredBlockKinds: string[];
  allowedBlockKinds: string[];
  /** Блоки, которые в этом чате уже уходили (id). */
  sentBlockIds: string[];
  noQuestions: boolean;
  allow: Allowlists;
  /** Сообщения бота, уже отправленные в этот чат. */
  pastBotMessages: string[];
  /** Бот уже здоровался сегодня. */
  greetedToday: boolean;
  config: GuardConfig;
  maxLength?: number;
}

export interface GuardResult {
  ok: boolean;
  violations: GuardViolation[];
  fixes: string[];
  /** Сообщения после автоправок. */
  messages: ComposedMessage[];
}

const DEFAULT_MAX_LENGTH = 3500;

export function runGuard(input: GuardInput): GuardResult {
  const violations: GuardViolation[] = [];
  const fixes: string[] = [];
  const maxLength = input.maxLength ?? DEFAULT_MAX_LENGTH;

  // --- автоправки -----------------------------------------------------------
  let messages = input.messages.map((m) => ({ ...m }));
  if (input.greetedToday) {
    const first = messages.findIndex((m) => !m.blockKind);
    if (first >= 0 && startsWithGreeting(messages[first].text)) {
      const stripped = stripLeadingGreeting(messages[first].text);
      if (stripped) {
        messages[first].text = stripped;
        fixes.push('Убрано повторное приветствие в первом сообщении');
      } else {
        messages = messages.filter((_, index) => index !== first);
        fixes.push('Убрано сообщение-приветствие: бот уже здоровался сегодня');
      }
    }
  }

  // --- блоки ------------------------------------------------------------------
  for (const kind of input.unknownBlockKinds) {
    if (input.exhaustedBlockKinds?.includes(kind)) {
      violations.push({ check: 'block_already_sent', messageIndex: null, detail: `Блок «${kind}» уже отправлялся в этом чате — не вставляй его снова, при необходимости сошлись на него словами` });
    } else {
      violations.push({ check: 'block_unknown', messageIndex: null, detail: `Блока «${kind}» нет в библиотеке — не используй этот маркер` });
    }
  }
  const allowed = new Set([...input.requiredBlockKinds, ...input.allowedBlockKinds]);
  const presentKinds = new Set<string>();
  messages.forEach((message, index) => {
    if (!message.blockKind) return;
    presentKinds.add(message.blockKind);
    if (!allowed.has(message.blockKind)) {
      violations.push({ check: 'block_not_allowed', messageIndex: index, detail: `Блок «${message.blockKind}» на этом этапе не разрешён` });
    } else if (message.blockId && input.sentBlockIds.includes(message.blockId)) {
      violations.push({ check: 'block_already_sent', messageIndex: index, detail: `Блок «${message.blockKind}» уже отправлялся в этом чате — не повторяй его` });
    }
  });
  for (const kind of input.requiredBlockKinds) {
    if (!presentKinds.has(kind)) {
      violations.push({ check: 'block_missing', messageIndex: null, detail: `Обязательный блок [[BLOCK:${kind}]] не вставлен` });
    }
  }
  dedupeViolations(violations);

  // --- текстовые проверки (только не-блоки) ---------------------------------------
  const admissions = input.config.botAdmissionPhrases.map((p) => p.toLowerCase()).filter(Boolean);
  const promises = input.config.promisePhrases.map((p) => p.toLowerCase()).filter(Boolean);

  messages.forEach((message, index) => {
    if (message.blockKind) return;
    const text = message.text;
    const lower = text.toLowerCase();

    if (!text.trim()) {
      violations.push({ check: 'empty', messageIndex: index, detail: 'Пустое сообщение' });
      return;
    }
    if (text.length > maxLength) {
      violations.push({ check: 'too_long', messageIndex: index, detail: `Сообщение длиннее ${maxLength} символов — сократи или раздели` });
    }

    for (const phrase of admissions) {
      if (containsPhrase(lower, phrase)) {
        violations.push({ check: 'bot_admission', messageIndex: index, detail: `Нельзя говорить «${phrase}» — ты человек` });
        break;
      }
    }
    for (const phrase of promises) {
      if (containsPhrase(lower, phrase)) {
        violations.push({ check: 'promise', messageIndex: index, detail: `Не обещай результат: «${phrase}»` });
        break;
      }
    }

    for (const detail of priceViolations(text, input.allow.numbers)) {
      violations.push({ check: 'price_not_in_facts', messageIndex: index, detail });
    }
    for (const url of extractUrls(text)) {
      if (!input.allow.urls.has(url)) {
        violations.push({ check: 'url_not_allowed', messageIndex: index, detail: `Ссылка ${url} не из фактов — убери её` });
      }
    }

    if (input.noQuestions && hasQuestion(text)) {
      violations.push({ check: 'question_forbidden', messageIndex: index, detail: 'На этом шаге вопросов не задаём — убери вопрос' });
    }

    if (text.length >= 40) {
      const { score } = maxSimilarity(text, input.pastBotMessages);
      if (score > input.config.similarityThreshold) {
        violations.push({
          check: 'too_similar',
          messageIndex: index,
          detail: `Сообщение почти повторяет уже отправленное (похожесть ${score.toFixed(2)}) — сформулируй иначе`,
        });
      }
    }
  });

  return { ok: violations.length === 0, violations, fixes, messages };
}

// --- разрешённые числа и ссылки --------------------------------------------------

export function buildAllowlists(
  facts: { value: string }[],
  personaLinks: { url: string }[],
  blocks: LibraryBlock[],
): Allowlists {
  const numbers = new Set<string>();
  const urls = new Set<string>();
  const texts = [...facts.map((f) => f.value), ...blocks.map((b) => b.text)];
  for (const text of texts) {
    for (const n of extractNumbers(text)) numbers.add(n);
    for (const u of extractUrls(text)) urls.add(u);
  }
  for (const link of personaLinks) urls.add(normalizeUrl(link.url));
  return { numbers, urls };
}

const NUMBER_RE = /\d[\d\s ]*\d|\d/g;

export function extractNumbers(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map((n) => n.replace(/[\s ]/g, ''));
}

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>()"']+|\b(?:t\.me|instagram\.com|youtube\.com|youtu\.be|vk\.com|taplink\.cc)\/[^\s<>()"']+/gi;

export function extractUrls(text: string): string[] {
  return (text.match(URL_RE) ?? []).map(normalizeUrl);
}

export function normalizeUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[.,;:!?)]+$/, '')
    .replace(/\/+$/, '');
}

const CURRENCY_AFTER_RE = /(\d[\d\s ]*\d|\d)\s*(?:₽|руб\.?|р\.|\$|€|eur|usd|тыс\.?|тысяч|k\b|долл)/gi;
const CURRENCY_BEFORE_RE = /(?:\$|€)\s*(\d[\d\s ]*\d|\d)/g;
const PRICE_WORD_RE = /(цен[аыу]|стоимост|стоит|прайс|price|cost)/i;

/** Числа в денежном контексте, которых нет среди разрешённых. */
export function priceViolations(text: string, allowedNumbers: Set<string>): string[] {
  const suspects = new Set<string>();
  for (const re of [CURRENCY_AFTER_RE, CURRENCY_BEFORE_RE]) {
    re.lastIndex = 0;
    let match = re.exec(text);
    while (match) {
      suspects.add(match[1].replace(/[\s ]/g, ''));
      match = re.exec(text);
    }
  }
  for (const line of text.split('\n')) {
    if (!PRICE_WORD_RE.test(line)) continue;
    for (const n of extractNumbers(line)) if (n.length >= 3) suspects.add(n);
  }
  const result: string[] = [];
  for (const n of suspects) {
    if (!allowedNumbers.has(n)) result.push(`Цена «${n}» не из фактов — называй только цены из блока фактов или не называй вовсе`);
  }
  return result;
}

function containsPhrase(lower: string, phrase: string): boolean {
  if (phrase.length <= 3) {
    // Короткие («gpt», «ии») — только как отдельное слово.
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(phrase)}($|[^\\p{L}\\p{N}])`, 'u').test(lower);
  }
  return lower.includes(phrase);
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dedupeViolations(violations: GuardViolation[]): void {
  const seen = new Set<string>();
  for (let i = violations.length - 1; i >= 0; i -= 1) {
    const key = `${violations[i].check}:${violations[i].detail}`;
    if (seen.has(key)) violations.splice(i, 1);
    else seen.add(key);
  }
}

/** Замечание для регенерации: список нарушений одной строкой. */
export function describeViolations(violations: GuardViolation[]): string {
  return violations
    .map((v) => (v.messageIndex === null ? v.detail : `Сообщение ${v.messageIndex + 1}: ${v.detail}`))
    .join('\n');
}
