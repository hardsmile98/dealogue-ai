import type { Decision } from '../prompt/decision.schema.js';
import type { SalesScript } from '../prompt/sales-script.schema.js';
import { asksForHuman, looksLikeStopRequest, looksReadyToPay } from './handoff-heuristics.js';

export interface GuardInput {
  decision: Decision;
  script: SalesScript;
  /** Последний блок сообщений клиента (склейка). */
  lastClientText: string;
  /** Последние сообщения ИИ/менеджера в этом чате — для проверки на повтор. */
  recentOutgoing: string[];
  /** p90 длины сообщения менеджера; 0 — неизвестно. */
  managerLenP90: number;
  previousStage: string | null;
  trigger: 'inbound' | 'followup' | 'test';
  minConfidence?: number;
}

export interface GuardResult {
  /** Что в итоге отправлять (после очистки). Пусто — не отправлять. */
  messages: string[];
  stage: string | null;
  silent: boolean;
  readyToPay: boolean;
  needsHuman: boolean;
  /** Причины вмешательства guard'а — в аудит. */
  notes: string[];
}

const MAX_MESSAGE_CHARS = 1200;
const MIN_CONFIDENCE = 0.4;
const ROBOTIC_RE = /(как (ии|искусственный интеллект|языковая модель|ассистент)|я (— )?(ии|бот|нейросеть|искусственный)|language model|as an ai)/i;
const INJECTION_RE = /(ignore (all )?previous|system prompt|системн(ый|ого) промпт|забудь (все|предыдущие) инструкции)/i;
const MARKDOWN_RE = /(\*\*|__|^#{1,6}\s|^\s*[-*]\s|^\s*\d+\.\s|```)/m;
const MONEY_RE = /(\d[\d\s]{2,}|\d+)\s*(₽|руб|рублей|р\.|тыс|k|\$|€|usd|eur)/gi;
const URL_RE = /https?:\/\/\S+|\b[a-z0-9-]+\.(ru|com|net|org|io|рф)\b/gi;

/**
 * Проверки поверх решения модели. Чистая функция: не отправляет, не пишет
 * в базу — только решает, что можно отправлять и что помечать.
 */
export function guardDecision(input: GuardInput): GuardResult {
  const { decision, script } = input;
  const notes: string[] = [];
  let readyToPay = decision.ready_to_pay;
  let needsHuman = decision.needs_human;
  let silent = decision.silent;

  // Этап: только известный из скрипта, иначе оставляем прежний.
  const known = new Set(script.stages.map((s) => s.key));
  let stage: string | null = known.has(decision.stage) ? decision.stage : input.previousStage;
  if (decision.stage && !known.has(decision.stage)) notes.push(`unknown_stage:${decision.stage}`);

  // Эвристики по тексту клиента — страховка.
  if (input.trigger === 'inbound' && looksReadyToPay(input.lastClientText) && !readyToPay) {
    readyToPay = true;
    notes.push('heuristic_ready_to_pay');
  }
  if (input.trigger === 'inbound' && asksForHuman(input.lastClientText) && !needsHuman) {
    needsHuman = true;
    notes.push('heuristic_needs_human');
  }
  if (input.trigger === 'followup' && looksLikeStopRequest(input.lastClientText)) {
    silent = true;
    notes.push('client_asked_to_stop');
  }
  if (stage === script.handoffStageKey && !readyToPay) {
    readyToPay = true;
    notes.push('handoff_stage');
  }

  const minConfidence = input.minConfidence ?? MIN_CONFIDENCE;
  if (!silent && decision.confidence < minConfidence) {
    needsHuman = true;
    notes.push(`low_confidence:${decision.confidence.toFixed(2)}`);
  }

  // Готов платить — отправляем фиксированную фразу передачи, если она задана.
  let messages = decision.messages.map(clean).filter(Boolean);
  if (readyToPay && script.handoffTemplate.trim()) {
    messages = [script.handoffTemplate.trim()];
    notes.push('handoff_template');
  }

  if (silent) {
    return { messages: [], stage, silent: true, readyToPay, needsHuman, notes };
  }

  // Роботизмы, инъекции, markdown.
  const joined = messages.join('\n');
  if (ROBOTIC_RE.test(joined)) {
    needsHuman = true;
    notes.push('robotic_phrase');
    messages = [];
  }
  if (INJECTION_RE.test(joined)) {
    needsHuman = true;
    notes.push('injection_echo');
    messages = [];
  }
  if (MARKDOWN_RE.test(joined)) {
    messages = messages.map(stripMarkdown);
    notes.push('markdown_stripped');
  }

  // Суммы и ссылки, которых нет в фактах, — не выдумываем.
  const factsText = [...script.facts, ...script.faq.map((f) => f.a), script.handoffTemplate].join('\n');
  const badMoney = findUnknown(joined, MONEY_RE, factsText);
  const badUrls = findUnknown(joined, URL_RE, factsText);
  if (badMoney.length > 0 || badUrls.length > 0) {
    needsHuman = true;
    notes.push(`unverified:${[...badMoney, ...badUrls].slice(0, 3).join('|')}`);
    messages = [];
  }

  // Повтор своего прошлого сообщения.
  for (const previous of input.recentOutgoing) {
    if (messages.some((m) => similar(m, previous))) {
      notes.push('repeats_previous');
      messages = [];
      silent = true;
      break;
    }
  }

  // Длина: не длиннее p90 менеджера × 1.5 (и жёсткий потолок).
  const cap = input.managerLenP90 > 0 ? Math.max(200, Math.round(input.managerLenP90 * 1.5)) : MAX_MESSAGE_CHARS;
  messages = messages.flatMap((m) => splitLong(m, Math.min(cap, MAX_MESSAGE_CHARS))).slice(0, 3);

  if (messages.length === 0 && !silent && !needsHuman) {
    needsHuman = true;
    notes.push('empty_reply');
  }

  return { messages, stage, silent, readyToPay, needsHuman, notes };
}

function clean(text: string): string {
  return text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '— ')
    .trim();
}

function findUnknown(text: string, re: RegExp, allowed: string[] | string): string[] {
  const allowedText = Array.isArray(allowed) ? allowed.join('\n') : allowed;
  const normalizedAllowed = allowedText.replace(/\s+/g, '').toLowerCase();
  const found = new Set<string>();
  for (const match of text.matchAll(re)) {
    const token = match[0].replace(/\s+/g, '').toLowerCase();
    if (!normalizedAllowed.includes(token)) found.add(match[0].trim());
  }
  return [...found];
}

/** Похожесть по триграммам символов: > 0.8 — считаем повтором. */
export function similar(a: string, b: string): boolean {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return common / Math.max(ta.size, tb.size) > 0.8;
}

function trigrams(text: string): Set<string> {
  const norm = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const result = new Set<string>();
  for (let i = 0; i + 3 <= norm.length; i += 1) result.add(norm.slice(i, i + 3));
  return result;
}

function splitLong(text: string, cap: number): string[] {
  if (text.length <= cap) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > cap) {
    const cut = Math.max(rest.lastIndexOf('\n', cap), rest.lastIndexOf('. ', cap), rest.lastIndexOf('! ', cap), rest.lastIndexOf('? ', cap));
    const at = cut > cap / 3 ? cut + 1 : cap;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
