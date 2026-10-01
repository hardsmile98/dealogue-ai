import {
  MILESTONE_TITLES,
  OBJECTION_TITLES,
  isObjectionCategory,
} from '../library/kinds.js';
import { lastOutgoing } from './history.js';
import { nudgesSaid } from './memory.js';
import { STEPS, stepTask } from './steps.js';
import type {
  HistoryMessage,
  Memory,
  ObjectionEnd,
  Plan,
  TurnTrigger,
} from './types.js';

/**
 * План словами (docs/agent-architecture.md, 3.4): его читают ответчик и
 * проверяющий. Всё, что ответчику можно и нужно сделать в ходе, названо
 * здесь — иначе проверяющий примет это за лишнее.
 */

export interface GoalContext {
  trigger: TurnTrigger;
  /** Первый ответ клиенту — начать с приветствия. */
  firstReply: boolean;
  memory: Memory;
  history: readonly HistoryMessage[];
  /**
   * Диагностика уже у клиента: тогда за отзыв или рассказ можно
   * поблагодарить. На знакомстве человек в реальной переписке не благодарит.
   */
  afterDiagnostic?: boolean;
}

/** Шаг хода — разрешённая связка к вехе («не увидел запроса, результаты ниже»). */
export function introducesMilestone(
  plan: Pick<Plan, 'nudge' | 'milestone'>,
): boolean {
  return Boolean(plan.milestone && plan.nudge && STEPS[plan.nudge].introduces);
}

/**
 * Нужен ли ответчик: есть шаг воронки, возражение или то, на что ответить.
 * Иначе ход — это веха сама по себе или молчание («ок» во время ожидания).
 */
export function needsWriter(
  plan: Pick<Plan, 'nudge' | 'answer' | 'objection'>,
): boolean {
  return (
    plan.nudge !== null || plan.answer.length > 0 || plan.objection !== null
  );
}

/** Чем закончить отработку возражения — словами для ответчика. */
const OBJECTION_ENDS: Record<ObjectionEnd, string> = {
  question: 'Этот вопрос — единственный в ответе.',
  step: 'Своих вопросов в отработке нет: к вариантам ведёт шаг воронки в конце сообщения.',
  open: 'Без вопросов и без призыва к действию.',
  release: 'Без вопросов и без призыва к действию.',
};

/** Сколько символов своего последнего сообщения видит напоминание по разговору. */
const LAST_MESSAGE_LENGTH = 200;

/**
 * Конец нашего последнего сообщения — к нему возвращается напоминание по
 * разговору. Проверяющий историю не видит: без этой строки он принимает
 * возврат к прошлому вопросу за лишний вопрос.
 */
function lastOwnMessage(history: readonly HistoryMessage[]): string | null {
  const last = lastOutgoing(history);
  if (!last) return null;
  const paragraphs = last.text.trim().split(/\n\s*\n/);
  const text = (paragraphs[paragraphs.length - 1] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > LAST_MESSAGE_LENGTH
    ? `…${text.slice(-LAST_MESSAGE_LENGTH)}`
    : text;
}

/**
 * Фразы из таблиц в плане — образцы тона и длины, не шаблон: дословный
 * пересказ звучит как бот, а одинаковые фразы повторяются из хода в ход.
 */
function samples(phrases: readonly string[], whose: string): string[] {
  if (phrases.length === 0) return [];
  return [
    `Образцы (${whose}) — тон и длина, не шаблон: не копируй их и не собирай из их кусков, напиши своё под этот разговор.`,
    ...phrases.map((phrase) => `«${phrase}»`),
  ];
}

function questionsLine(max: number): string {
  return max === 0
    ? 'Вопросов клиенту в ответе нет.'
    : `Вопросов клиенту в ответе — не больше ${max}, только те, что просит план.`;
}

export function describeGoal(plan: Plan, context: GoalContext): string {
  if (!needsWriter(plan)) {
    return plan.milestone
      ? `Отправить «${MILESTONE_TITLES[plan.milestone.key]}» (${plan.milestone.title}) без сопровождения — писать ничего не нужно.`
      : 'Промолчать: клиенту нечего отвечать, шага воронки нет — только «прочитано».';
  }
  const lines: string[] = [];
  if (context.trigger === 'schedule') {
    lines.push(
      'Ход по расписанию: ты пишешь первым, клиент ничего нового не писал. Не благодари, не отвечай и не сочувствуй — отвечать не на что; паузу не комментируй; не ссылайся на слова клиента, которых нет в истории.',
    );
  }
  if (context.firstReply) {
    lines.push(
      'Это первый ответ клиенту: начни с приветствия — просто поздоровайся («Здравствуйте!») и сразу переходи к делу, без любезностей («рад, что написали», «рад, что вы заглянули», «спасибо за обращение»).',
    );
  }
  if (plan.condolences) {
    lines.push(
      'Клиент пишет о горе — смерти или потере близкого. Начни с простых слов соболезнования («Примите мои соболезнования 🙏»), коротко и без пересказа его слов; о работе, вариантах и ценах не говори, если план этого не просит.',
    );
  }
  if (plan.answer.length > 0) {
    const items = plan.answer.map((point, index) => {
      const hold = point.hold ? ` — ${point.hold}` : '';
      return `${index + 1}) ${point.text}${hold}`;
    });
    lines.push(
      `Ответить коротко, по существу, в этом порядке: ${items.join('; ')}.`,
    );
  }
  if (plan.objection) {
    const { objection } = plan;
    const title = isObjectionCategory(objection.category)
      ? OBJECTION_TITLES[objection.category]
      : objection.category;
    const nth =
      objection.approach > 0
        ? ` (на этом этапе уже ${objection.approach + 1}-й раз — не так, как в прошлый)`
        : '';
    lines.push(
      `Возражение «${title}»${nth}: ${objection.task}. ${OBJECTION_ENDS[objection.ends]} Сначала коротко откликнись на его слова по сути, не спорь и не дави.`,
      ...samples(objection.phrases, 'так практик отвечает на похожее'),
    );
  }
  if (plan.nudge) {
    const step = STEPS[plan.nudge];
    const task = stepTask(plan.nudge, plan, context.memory);
    const statement = step.statement
      ? ' Шаг — утверждение: вопросов в нём нет, даже если они есть в образцах («хорошо?»).'
      : '';
    const keep =
      step.keepQuestion || plan.coveredNudges.includes('clarify_request')
        ? ' Уточняющий вопрос из образца сохрани по смыслу — по ответу на него выбирается диагностика; остальное пиши своими словами.'
        : '';
    // Шаг уже делали (вопрос о вариантах после возражения, повторная просьба) — иначе, чем в прошлый раз.
    const again =
      nudgesSaid(context.memory.said, plan.nudge) > 0
        ? ' Такой шаг уже был в разговоре — скажи другими словами, не так, как в прошлый раз.'
        : '';
    const together =
      plan.answer.length > 0 || plan.objection
        ? ' (в том же сообщении, после ответа)'
        : '';
    lines.push(`Шаг воронки${together}: ${task}.${statement}${keep}${again}`);
    if (plan.react.length > 0) {
      lines.push(
        `Клиент рассказал: ${plan.react.join('; ')}. Начни сообщение с короткого отклика на это по сути — одно предложение${context.afterDiagnostic ? ' (можно поблагодарить за обратную связь или за то, что поделился)' : ''}, отдельного ответа не нужно.`,
      );
    }
    if (plan.nudge === 'follow_up') {
      const last = lastOwnMessage(context.history);
      if (last)
        lines.push(`Твоё последнее сообщение клиенту (конец): «${last}».`);
    }
    lines.push(...samples(plan.phrases, 'так этот шаг звучит у практика'));
  }
  if (plan.milestone) {
    const intro = introducesMilestone(plan)
      ? 'Шаг и есть короткая связка к ней — кроме неё о ней не пиши: ни пересказа, ни продолжения.'
      : 'О ней не пиши: ни вступления, ни пересказа, ни продолжения.';
    lines.push(
      `Сразу после твоих сообщений система отправит «${MILESTONE_TITLES[plan.milestone.key]}» (${plan.milestone.title}) текстом из библиотеки. ${intro}`,
    );
  }
  lines.push(questionsLine(plan.constraints.maxQuestions));
  if (plan.constraints.doNotRepeat.length > 0)
    lines.push(
      `Уже было, не повторять: ${plan.constraints.doNotRepeat.join(', ')}.`,
    );
  if (plan.constraints.doNotMention.length > 0)
    lines.push(`Не упоминать: ${plan.constraints.doNotMention.join(', ')}.`);
  return lines.join('\n');
}
