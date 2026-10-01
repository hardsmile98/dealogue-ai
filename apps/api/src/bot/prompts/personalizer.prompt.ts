import type { HistoryLine } from '../core/history.js';
import { parseJsonObject } from '../core/json.js';
import { MAX_PERSONAL_EDITS, numberedParagraphs } from '../core/personalize.js';
import type { PersonalizationEdit } from '../core/personalize.js';
import type { Memory } from '../core/types.js';
import type { LlmMessage } from '../llm/llm.types.js';
import type { Persona } from '../library/persona.js';
import { memoryBlock } from './blocks.js';

/** Сколько последних сообщений клиента видит подстройка — его слова о себе. */
const CLIENT_LINES = 15;

const RULES = `Перед отправкой ты слегка подстраиваешь готовый текст своей диагностики под этого клиента, чтобы он читался как написанный именно ему. Текст почти не меняется: ты правишь несколько абзацев, остальные уходят как есть.

Что сделать:
1. Начало (обычно абзац 1, где ты вернулся с результатами) свяжи с тем, с чем клиент пришёл: несколько слов о его запросе или ситуации своими словами (например, «посмотрел вашу ситуацию с работой» или «разобрал, что сейчас происходит у вас в отношениях»), без пересказа и без цитат. Если он поделился тяжёлым, можно одну короткую тёплую фразу по сути, без пафоса и без «я понимаю ваши чувства». Если о запросе ничего не известно, просто скажи то же чуть иначе.
2. Ещё 2–4 абзаца в разных местах текста скажи чуть иначе: поменяй порядок слов, замени отдельные слова и обороты близкими по смыслу. Где это ложится естественно, свяжи абзац с ситуацией клиента — только с тем, что он сам написал.
3. Всего правок — не больше ${MAX_PERSONAL_EDITS} абзацев. Остальные не трогай и не возвращай.

В каждом изменённом абзаце сохрани: смысл и все утверждения, образы и термины (энергетическое поле, чакры, родовые программы и т. п.), длину (примерно ±20%; своего — не больше одной короткой фразы), эмодзи и значки оформления, обращение (если «Вы» с большой буквы — так и оставь), род, в котором ты пишешь о себе в тексте, язык текста, вопрос или приглашение, если они есть в абзаце.

Нельзя:
- новые утверждения о клиенте, событиях его жизни и людях вокруг него — кроме того, что он сам написал;
- новые прогнозы, сроки, обещания результата, цены, суммы, ссылки;
- новые вопросы; убирать вопрос или приглашение в конце текста;
- менять смысл того, что ты увидел в диагностике;
- обращаться по имени, если клиент сам его не назвал (тогда оно есть в карточке), и больше одного раза за текст;
- упоминать, что текст подстроен, или что это шаблон.

Пиши как живой человек: просто и тепло, без канцелярита и ассистентских оборотов; длинное тире не ставь — дефис или запятая, как в самом тексте.

Формат ответа — один JSON-объект:
{"edits": [{"n": 1, "text": "новый текст абзаца целиком"}], "notes": "одно предложение: что поменял"}
- n — номер абзаца из текста ниже; text — абзац целиком, без номера в скобках.`;

export interface PersonalizerPromptInput {
  persona: Persona;
  memory: Memory;
  history: readonly HistoryLine[];
  /** Текст диагностики из библиотеки. */
  text: string;
}

/**
 * Промпт подстройки диагностики (core/personalize.ts): правила и текст
 * диагностики первыми — под кэш префикса (у одной категории текст один и
 * тот же), память и слова клиента — в конце.
 */
export function buildPersonalizerPrompt(
  input: PersonalizerPromptInput,
): LlmMessage[] {
  const system = [
    `Ты — ${input.persona.name}, энергопрактик. Ты сам переписываешься с клиентами в Telegram.`,
    '',
    RULES,
  ];
  const said = input.history
    .filter((line) => line.role === 'client')
    .slice(-CLIENT_LINES)
    .map((line) => `- ${line.text}`);
  const user = [
    '## Текст диагностики (абзацы пронумерованы)',
    ...numberedParagraphs(input.text),
    '',
    '## Что известно о клиенте',
    memoryBlock(input.memory),
    '',
    '## Что клиент писал',
    ...(said.length > 0 ? said : ['(ничего, кроме данных)']),
    '',
    'Подстрой текст под этого клиента.',
  ];
  return [
    { role: 'system', content: system.join('\n') },
    { role: 'user', content: user.join('\n') },
  ];
}

/**
 * Правки из ответа модели. Мусор — правок нет: диагностика уйдёт как в
 * библиотеке, подстройка не должна ронять ход.
 */
export function parsePersonalization(raw: string): PersonalizationEdit[] {
  const list = parseJsonObject(raw)?.edits;
  if (!Array.isArray(list)) return [];
  const edits: PersonalizationEdit[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const { n, text } = item as Record<string, unknown>;
    const index = typeof n === 'string' ? Number(n) : n;
    if (typeof index !== 'number' || !Number.isInteger(index)) continue;
    if (typeof text !== 'string' || !text.trim()) continue;
    edits.push({ n: index, text });
  }
  return edits;
}
