import { parseJsonObject } from '../core/json.js';
import type {
  IncomingMessage,
  Memory,
  Plan,
  Review,
  ReviewViolation,
} from '../core/types.js';
import type { LlmMessage } from '../llm/llm.types.js';
import type { Persona } from '../library/persona.js';
import {
  aboutBlock,
  blockPreview,
  memoryBlock,
  personaBlock,
  turnBlock,
} from './blocks.js';
import type { LibrarySample } from './blocks.js';

/** Нарушения, из-за которых ответчик переписывает черновик. */
export const HARD_CODES = new Set([
  'unanswered_point',
  'step_missing',
  'extra_question',
  'extra_text',
  'repeat',
  'invented_client_fact',
  'invented_practice_fact',
  'forbidden_topic',
  'wrong_language',
  'wrong_gender',
  'beyond_plan',
  'promised_deadline',
  'answers_nothing',
]);

/**
 * Что блокирует отправку, если осталось и после переписывания (раздел 3.6):
 * выдуманные факты, цены, повторы, запрещённые темы, язык. Остальное —
 * повод переписать, но не молчать.
 */
export const BLOCKING_CODES = new Set([
  'repeat',
  'invented_client_fact',
  'invented_practice_fact',
  'forbidden_topic',
  'wrong_language',
  'promised_deadline',
]);

const SYSTEM = `Ты проверяешь черновик ответа энергопрактика клиенту в Telegram. Ты не переписываешь текст — только находишь нарушения по чек-листу. Отвечай строго одним JSON-объектом: {"violations": [{"code": "…", "severity": "hard|style", "detail": "что именно не так, одной фразой"}]}. Если нарушений нет — {"violations": []}.

Практик ведёт клиента по воронке из своего сценария и не пишет лишнего: в ответе должно быть только то, что есть в плане, — ответы на перечисленные пункты и шаг воронки.

Чек-лист и коды:
- unanswered_point (hard): пункт «Ответить» из плана полностью проигнорирован. Короткий ответ по существу — это ответ. Порядок пунктов и подробность — не нарушение.
- step_missing (hard): план требует шаг воронки, а в тексте его нет, или потерян вопрос, который шаг должен задать, или смысл заметно отличается от фразы из сценария. Другие слова, подстройка под разговор и под задачу шага — не нарушение. Если план говорит, что шаг — утверждение, вопрос в нём — это extra_question.
- extra_question (hard): вопрос клиенту, которого нет в шаге воронки («как давно это началось?», «напишите, что откликнется», «расскажите подробнее»). Вопрос из шага и его переформулировка — не нарушение.
- extra_text (hard): фраза или сообщение сверх плана: подтверждение полученного («записал», «принял», «отлично, всё есть»), анонс своих действий, если это не шаг воронки («берусь за карту», «смотрю под ваш запрос»), оценка или пересказ слов клиента («это важная деталь», «хорошо, что вы это озвучили», «вы написали, что…»), ответ на то, чего нет в плане, вступление к вехе или продолжение после неё. Приветствие в первом ответе, короткое «спасибо» и связка в пару слов между ответом и шагом — не нарушение.
- repeat (hard): дословно повторён вопрос или аргумент из списка «Уже было, не повторять».
- invented_client_fact (hard): тексту приписан конкретный факт о клиенте (имя, возраст, событие, обстоятельство), которого нет в памяти и в его новых сообщениях. Эмпатия («понимаю, вам тяжело»), общие вопросы («что вас беспокоит?») и обычные обороты фактами не считаются.
- invented_practice_fact (hard): конкретный факт о практике или о практике как человеке, которого нет ни в образе (имя, пол, биография, страницы — это допустимый источник), ни в разделе «о себе и о работе»: цифры, сроки, места, названия методов, любая цена, сумма или ссылка своими словами. Пересказ биографии из образа — не нарушение. Общие фразы вроде «я работаю с такими блоками», «мы это разберём» — не нарушение.
- wrong_gender (hard): практик пишет о себе не в том роде, что указан в образе («я поняла» у мужчины, «я понял» у женщины).
- promised_deadline (hard): обещан конкретный срок или гарантированный результат.
- answers_nothing (hard): ход по расписанию (новых сообщений клиента нет), а текст благодарит клиента, отвечает ему или сочувствует так, будто он только что написал («спасибо, что поделились», «понимаю, как вам тяжело»).
- forbidden_topic (hard): раскрыта тема из «Не упоминать» (например, названы цены). Сказать «к стоимости вернёмся чуть позже» — не нарушение, если план об этом просит.
- wrong_language (hard): ответ не на языке из плана.
- beyond_plan (hard): текст делает шаг воронки, которого нет в плане, продаёт, пересказывает содержание вехи, которую вставляет система, или повторяет её смысл другими словами (веха «вернулся с результатами», а перед ней «я вернулся с результатами»).
- too_long (style): сообщений больше лимита или текст явно длиннее, чем нужно для мессенджера.
- tone (style): канцелярит, списки, заголовки, лишние эмодзи, обращение на «ты», ассистентский тон.

Отмечай только то, в чём уверен. Лучше пропустить спорное, чем придумать нарушение: за каждым hard стоит переписывание ответа, а за ложным — молчание практика.`;

export interface ReviewerPromptInput {
  persona: Persona;
  about: readonly LibrarySample[];
  memory: Memory;
  plan: Plan;
  messages: readonly IncomingMessage[];
  parts: readonly string[];
  /** Тело вехи — чтобы увидеть, не повторяет ли текст её смысл. */
  block?: string | null;
  /** Повторная проверка после правок: только грубые нарушения, в которых полная уверенность. */
  final?: boolean;
}

export function buildReviewerPrompt(input: ReviewerPromptInput): LlmMessage[] {
  const user = [
    '## Образ практика',
    personaBlock(input.persona),
    '',
    '## О себе и о работе',
    aboutBlock(input.about),
    '',
    '## Что известно о клиенте',
    memoryBlock(input.memory),
    '',
    '## План хода',
    input.plan.goal,
    `Язык: ${input.plan.constraints.language}. Сообщений не больше ${input.plan.constraints.maxParts}.`,
    '',
    '## Новые сообщения клиента',
    turnBlock(input.messages),
    '',
    '## Черновик ответа (части пронумерованы)',
    ...draftLines(input),
    ...(input.final
      ? [
          '',
          'Это повторная проверка после правок. Если ответ отправить нельзя, клиент получит вместо него дежурную фразу — поэтому отмечай только грубые нарушения, в которых уверен полностью: названные цены и суммы, выдуманные конкретные факты, запрещённые темы, не тот язык. Естественные выводы из слов клиента и разумные обобщения нарушением не считай.',
        ]
      : []),
  ].join('\n');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];
}

/** Черновик как его увидит клиент; тело вехи — строкой-заглушкой: его вставляет система, проверять его не нужно. */
function draftLines(input: ReviewerPromptInput): string[] {
  const lines = input.parts.map((part, index) => `[${index + 1}] ${part}`);
  const { milestone, afterBlock } = input.plan;
  if (!milestone) return lines;
  const preview = input.block
    ? `: «${blockPreview(input.block, afterBlock ? 'end' : 'start')}»`
    : '';
  const block = `[веха «${milestone.title}» — текст из библиотеки, вставит система${preview}]`;
  return afterBlock ? [block, ...lines] : [...lines, block];
}

/** Разбор ответа проверяющего; мусор считается отсутствием нарушений — проверка не должна ронять ход. */
export function parseReview(raw: string): Review {
  const list = parseJsonObject(raw)?.violations;
  if (!Array.isArray(list)) return { violations: [] };
  const violations: ReviewViolation[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const { code, severity, detail } = item as Record<string, unknown>;
    if (typeof code !== 'string' || !code) continue;
    violations.push({
      code,
      severity: severity === 'hard' || HARD_CODES.has(code) ? 'hard' : 'style',
      detail: typeof detail === 'string' ? detail : '',
    });
  }
  return { violations };
}

export function reviewNotes(review: Review): string[] {
  return review.violations.map(
    (violation) => `${violation.code}: ${violation.detail || 'исправь'}`,
  );
}

export function hasHardViolations(review: Review): boolean {
  return review.violations.some((violation) => violation.severity === 'hard');
}

/** Остались нарушения, с которыми отправлять нельзя. */
export function isBlocking(review: Review): boolean {
  return review.violations.some((violation) =>
    BLOCKING_CODES.has(violation.code),
  );
}
