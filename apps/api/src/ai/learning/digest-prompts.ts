import type { DigestPartial } from './style-profile.schema.js';
import { PHRASE_INTENTS } from './style-profile.schema.js';

export interface DigestDialog {
  index: number;
  chatId: string;
  transcript: string;
}

const INTENT_HINTS: Record<(typeof PHRASE_INTENTS)[number], string> = {
  greeting: 'приветствие и первый контакт',
  qualify: 'выяснение потребности, уточняющие вопросы',
  price: 'ответ про стоимость и условия',
  materials: 'отправка материалов, презентации, прайса',
  call_offer: 'предложение созвониться или встретиться',
  objection: 'работа с возражением (дорого, подумаю, не сейчас)',
  close: 'подведение к решению, оформление',
  payment: 'оплата, реквизиты, счёт',
  followup: 'напоминание о себе после паузы клиента',
  other: 'всё остальное',
};

export function digestMapSystemPrompt(): string {
  const intents = PHRASE_INTENTS.map((i) => `- ${i}: ${INTENT_HINTS[i]}`).join('\n');
  return [
    'Ты анализируешь переписки менеджера по продажам с клиентами в Telegram.',
    'Реплики менеджера помечены «М:», клиента — «К:». Твоя задача — выписать, КАК пишет менеджер и ЧТО он говорит, чтобы другой человек мог писать неотличимо.',
    '',
    'Извлеки из этой пачки диалогов:',
    '1. styleObservations — конкретные наблюдения о манере письма менеджера: длина сообщений, регистр первой буквы, точки в конце, эмодзи, обращение (ты/вы), приветствия, характерные слова и обороты, разбивает ли ответ на несколько сообщений. Только то, что реально видно в тексте.',
    '2. phrases — дословные удачные фразы менеджера с намерением. Намерения:',
    intents,
    '3. faq — вопросы клиентов и ответы менеджера на них (как отвечает именно он).',
    '4. objections — возражения клиентов и как менеджер их отрабатывает.',
    '5. facts — факты о продукте, ценах, условиях, сроках, которые менеджер называет клиентам. Только явно сказанное менеджером, без домыслов.',
    '6. exemplars — до 3 самых показательных диалогов пачки: dialogIndex, краткое содержание, исход (won — договорились/оплата, lost — отказ, unknown).',
    '',
    'Пиши по-русски. Не придумывай ничего, чего нет в переписке. Ответ — только JSON по схеме.',
  ].join('\n');
}

export function digestMapUserPrompt(dialogs: DigestDialog[]): string {
  return dialogs
    .map((d) => `=== Диалог ${d.index} ===\n${d.transcript}`)
    .join('\n\n');
}

export function digestReduceSystemPrompt(): string {
  return [
    'Ты сводишь наблюдения из нескольких пачек переписок в один профиль стиля менеджера по продажам.',
    'На входе — списки наблюдений о стиле, фраз с намерениями, FAQ, возражений и фактов из разных пачек.',
    '',
    'Сделай:',
    '1. styleGuide — 1–2 абзаца конкретных инструкций «как писать, чтобы быть неотличимым от этого менеджера»: длина, регистр, пунктуация, эмодзи, обращение, приветствия, разбивка на сообщения, характерные слова. Формулируй как правила для исполнителя, без общих слов вроде «дружелюбно и профессионально».',
    '2. phrasebook — по каждому намерению до 8 лучших дословных фраз (убери дубли и почти дубли).',
    '3. faq — объединённые вопросы-ответы; seen — сколько раз встречалось похожее.',
    '4. objections — объединённые возражения и ответы; seen аналогично.',
    '5. facts — уникальные факты о продукте и условиях. Противоречащие друг другу факты (например разные цены) оставь оба и пометь «(встречались разные)».',
    '',
    'Пиши по-русски. Ответ — только JSON по схеме.',
  ].join('\n');
}

export function digestReduceUserPrompt(partials: DigestPartial[]): string {
  const observations = partials.flatMap((p) => p.styleObservations);
  const phrases = partials.flatMap((p) => p.phrases);
  const faq = partials.flatMap((p) => p.faq);
  const objections = partials.flatMap((p) => p.objections);
  const facts = partials.flatMap((p) => p.facts);
  return [
    `Наблюдения о стиле (${observations.length}):`,
    ...observations.map((o) => `- ${o}`),
    '',
    `Фразы менеджера (${phrases.length}):`,
    ...phrases.map((p) => `- [${p.intent}] ${p.text}`),
    '',
    `FAQ (${faq.length}):`,
    ...faq.map((f) => `- В: ${f.q}\n  О: ${f.a}`),
    '',
    `Возражения (${objections.length}):`,
    ...objections.map((o) => `- Возражение: ${o.objection}\n  Ответ: ${o.answer}`),
    '',
    `Факты (${facts.length}):`,
    ...facts.map((f) => `- ${f}`),
  ].join('\n');
}
