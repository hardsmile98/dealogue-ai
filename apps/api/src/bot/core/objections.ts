import { isObjectionCategory } from '../library/kinds.js';
import type {
  LibraryKind,
  ObjectionCategory,
  Stage,
} from '../library/kinds.js';
import { saidSince } from './memory.js';
import type { Memory, Nudge, ObjectionEnd } from './types.js';

/**
 * Отработка возражений по этапам (docs/agent-architecture.md, 2.5). После
 * диагностики клиент спорит с диагностикой, а не с работой — вариантов он
 * ещё не видел; после вариантов — с ними. Категорию называет анализатор,
 * как отработать — решает эта таблица.
 */

/** Этапы со своей отработкой возражений. */
export type ObjectionStage = 'diagnostic' | 'offer';

export interface ObjectionMove {
  /** Что сделать — словами для ответчика. */
  task: string;
  ends: ObjectionEnd;
}

/** Плейбук этапа в библиотеке: образцы тона для отработки. */
export const OBJECTION_PLAYBOOKS: Record<ObjectionStage, LibraryKind> = {
  diagnostic: 'diagnostic_objection',
  offer: 'objection',
};

/** Возвратный вопрос этапа — шаг воронки, к которому возвращается разговор. */
export const RETURN_STEPS: Record<ObjectionStage, Nudge> = {
  diagnostic: 'ask_want_options',
  offer: 'ask_offer_questions',
};

const LATER: ObjectionMove = {
  task: 'клиенту сейчас не до этого. Без давления скажи, что можно вернуться к разговору, когда ему будет удобно',
  ends: 'open',
};
const ASK_PARTNER: ObjectionMove = {
  task: 'клиент хочет посоветоваться с близкими. Конечно, это его решение: скажи, что если появятся вопросы — ты на связи',
  ends: 'open',
};
const TRIED_BEFORE: ObjectionMove = {
  task: 'клиент уже пробовал что-то похожее. С уважением к его опыту одним вопросом спроси, что он пробовал и что не сработало',
  ends: 'question',
};

/**
 * Подходы по этапу и категории. Повтор той же категории на этапе берёт
 * следующий подход; подходы кончились — клиента отпускаем (`LET_GO`), а не
 * повторяем прошлый. Чего нет в таблице — `DEFAULT_MOVES`.
 */
const OBJECTION_MOVES: Record<
  ObjectionStage,
  Partial<Record<ObjectionCategory, readonly ObjectionMove[]>>
> = {
  diagnostic: {
    not_resonate: [
      {
        task: 'клиент не узнаёт себя в диагностике. Спокойно прими это, без спора и оправданий, и одним вопросом спроси, что у него сейчас на самом деле происходит в этой сфере',
        ends: 'question',
      },
      {
        task: 'клиент снова не узнаёт себя в диагностике. Не спорь: коротко скажи, что диагностика показывает глубинные настройки, которые не всегда заметны снаружи, и что с его ситуацией можно работать',
        ends: 'step',
      },
    ],
    dont_believe: [
      {
        task: 'клиент не верит, что это работает. Не уговаривай и ничего не доказывай: скажи, что сомневаться нормально и решать ему',
        ends: 'step',
      },
      {
        task: 'клиент снова не верит. Не спорь и не повторяй прошлый ответ: коротко скажи, что диагностика — общая картина, а в работе разбирается уже его конкретная ситуация',
        ends: 'step',
      },
    ],
    think_about_it: [
      {
        task: 'клиент хочет подумать или сначала разобраться. Без давления: решение за ним, а узнать, как это можно проработать, ни к чему не обязывает',
        ends: 'step',
      },
    ],
    tried_before: [TRIED_BEFORE],
    ask_partner: [ASK_PARTNER],
    no_time: [LATER],
    later: [LATER],
  },
  offer: {
    think_about_it: [
      {
        task: 'клиент хочет подумать. Без давления одним вопросом спроси, что именно заставляет задуматься: остались вопросы по работе или дело в финансовом вопросе',
        ends: 'question',
      },
      {
        task: 'клиент снова сомневается. Мягко спроси, что смутило или осталось непонятным; решать ему',
        ends: 'question',
      },
    ],
    dont_believe: [
      {
        task: 'клиент не верит, что это сработает. Не уговаривай и не доказывай: одним вопросом предложи подробнее рассказать, как проходит работа, — чтобы сложилась полная картина; прислать отзывы не обещай',
        ends: 'question',
      },
    ],
    not_resonate: [
      {
        task: 'клиенту не подходит ни один вариант. Не спорь: одним вопросом спроси, что именно не подошло или какого результата он хочет',
        ends: 'question',
      },
    ],
    tried_before: [TRIED_BEFORE],
    ask_partner: [ASK_PARTNER],
    no_time: [LATER],
    later: [LATER],
  },
};

const DEFAULT_MOVES: Record<ObjectionStage, ObjectionMove> = {
  diagnostic: {
    task: 'отработай коротко и спокойно, без спора и давления',
    ends: 'step',
  },
  offer: {
    task: 'отработай коротко и спокойно, без спора и давления',
    ends: 'open',
  },
};

/** До диагностики возражать не с чем: ответить и вести дальше по знакомству. */
const EARLY_MOVE: ObjectionMove = {
  task: 'отработай коротко и спокойно, без спора и давления; о вариантах работы и ценах не говори',
  ends: 'open',
};

/** Возражений на этапе не больше — дальше агент не уговаривает. */
export const MAX_OBJECTION_MOVES = 2;

/** Отпустить клиента: подходы кончились, дальше — только если он вернётся сам. */
const LET_GO: ObjectionMove = {
  task: 'клиент возражает не первый раз. Не уговаривай и не задавай вопросов: спокойно скажи, что понимаешь, и если он захочет вернуться к разговору — ты на связи',
  ends: 'release',
};

export function objectionStage(stage: Stage): ObjectionStage | null {
  return stage === 'diagnostic' || stage === 'offer' ? stage : null;
}

export interface ChosenMove {
  move: ObjectionMove;
  /** Номер подхода к этой категории на этапе (0 — первый). */
  approach: number;
  /** Плейбук с образцами; null — образцы не нужны (до диагностики, клиента отпускаем). */
  playbook: LibraryKind | null;
}

/**
 * Подход к возражению на этапе: по категории и номеру повтора. Подходы
 * категории кончились (тот же подход второй раз — это повтор) или
 * возражений на этапе уже `MAX_OBJECTION_MOVES` — клиента отпускаем.
 */
export function objectionMove(
  stage: Stage,
  category: string,
  said: Memory['said'],
): ChosenMove {
  const at = objectionStage(stage);
  if (!at) return { move: EARLY_MOVE, approach: 0, playbook: null };
  const argued = saidSince(said, at).filter(
    (entry) => entry.kind === 'argument',
  );
  const approach = argued.filter((entry) =>
    entry.key.startsWith(`${category}:`),
  ).length;
  const moves = (isObjectionCategory(category)
    ? OBJECTION_MOVES[at][category]
    : undefined) ?? [DEFAULT_MOVES[at]];
  const move = moves[approach];
  if (!move || argued.length >= MAX_OBJECTION_MOVES)
    return { move: LET_GO, approach, playbook: null };
  return { move, approach, playbook: OBJECTION_PLAYBOOKS[at] };
}
