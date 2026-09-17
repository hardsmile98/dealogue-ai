import type { SeedPlaybook } from './seed.types.js';

/**
 * Плейбуки этапов по умолчанию (раздел 5.2 ТЗ). Владелец правит их в UI;
 * «вернуть по умолчанию» подставляет это.
 */
export const DEFAULT_PLAYBOOKS: SeedPlaybook[] = [
  {
    stage: 'greeting',
    goal: 'Поздороваться и попросить дату и место рождения.',
    instructions: [
      'Первое сообщение от тебя. Поздоровайся коротко, как в примерах, и попроси дату и место рождения.',
      'Если клиент уже прислал часть данных — попроси только недостающее и поблагодари за присланное.',
      'Если клиент в первом же сообщении описал, что его беспокоит, — коротко отреагируй на это одной фразой, но всё равно попроси дату и место рождения.',
      'Не рассказывай об услугах, не называй цены, не задавай других вопросов.',
    ].join('\n'),
    requiredBlockKinds: [],
    allowedBlockKinds: [],
    exampleKinds: ['greeting'],
    noQuestions: false,
  },
  {
    stage: 'collect_birth',
    goal: 'Получить дату и место рождения.',
    instructions: [
      'Реагируй на то, что прислал клиент: если данные пришли — поблагодари и переходи к знакомству (этап collect_request), не переспрашивай.',
      'Если данных нет и это касание-напоминание — мягко напомни один раз, как в примере birth_nudge, без давления.',
      'Не спрашивай пол, возраст напрямую и не объясняй, зачем нужны данные, длиннее одного предложения.',
    ].join('\n'),
    requiredBlockKinds: [],
    allowedBlockKinds: [],
    exampleKinds: ['birth_nudge', 'greeting'],
    noQuestions: false,
  },
  {
    stage: 'collect_request',
    goal: 'Познакомиться и выяснить, что беспокоит клиента.',
    instructions: [
      'Коротко представься по образцу intro (кто ты, откуда) и задай один открытый вопрос: что случилось, что беспокоит, на какую сферу сделать упор.',
      'Если запрос уже понятен из переписки — не спрашивай снова, переходи к подтверждению (ack_request).',
      'Если чего-то одного не хватает для выбора диагностики (например, в отношениях сейчас или нет) — задай ровно один уточняющий вопрос из категории. Второе уточнение подряд не задавай.',
      'Цены и услуги не обсуждай; если спросят — скажи, что сначала посмотришь диагностику, а стоимость обсудите после.',
    ].join('\n'),
    requiredBlockKinds: [],
    allowedBlockKinds: [],
    exampleKinds: ['intro', 'empathy'],
    noQuestions: false,
  },
  {
    stage: 'ack_request',
    goal: 'Показать, что понял запрос, дать ссылки и пообещать диагностику.',
    instructions: [
      'Одна-две фразы эмпатии под ситуацию клиента (по примерам empathy/ack_request), затем скажи, что займёшься диагностикой и вернёшься с результатом — это займёт некоторое время.',
      'Вставь блок ссылок [[BLOCK:links]] отдельным сообщением, как есть.',
      'Не обсуждай цены и услуги, не задавай вопросов — клиент ждёт диагностику.',
    ].join('\n'),
    requiredBlockKinds: ['links'],
    allowedBlockKinds: ['links'],
    exampleKinds: ['ack_request', 'empathy'],
    noQuestions: true,
  },
  {
    stage: 'diagnostics',
    goal: 'Отправить диагностику.',
    instructions: [
      'Перед блоком диагностики — короткая личная связка (1–2 предложения) с привязкой к запросу клиента, если запрос известен. Если запроса нет — используй образец diag_closing без запроса.',
      'Блок диагностики вставляется дословно маркером, менять текст нельзя.',
      'После блока — один завершающий вопрос по образцам diag_closing/reengage: что откликнулось, есть ли вопросы.',
    ].join('\n'),
    requiredBlockKinds: [],
    allowedBlockKinds: [],
    exampleKinds: ['diag_closing', 'reengage'],
    noQuestions: false,
  },
  {
    stage: 'post_diagnostics',
    goal: 'Получить реакцию на диагностику и ответить на вопросы.',
    instructions: [
      'Если клиент отвечает — обсуждай диагностику по её тексту, отвечай на вопросы только по фактам.',
      'Не продавай в первом же ответе, если клиент не спрашивал об услугах. Если спросил о цене — можно перейти к этапу price (stageProgress: jump:price).',
      'Касание reengage: один короткий вопрос по образцам, без пересказа диагностики.',
    ].join('\n'),
    requiredBlockKinds: [],
    allowedBlockKinds: [],
    exampleKinds: ['reengage', 'empathy'],
    noQuestions: false,
  },
  {
    stage: 'offer',
    goal: 'Предложить услуги.',
    instructions: [
      'Начни со связки с запросом клиента (одно-два предложения), затем опиши суть предложения по фактам об услугах и образцам offer — своими словами, не копируя образец целиком, короче образца.',
      'Заверши вопросом: что откликается, какое направление ближе.',
      'Цены не называй, пока не спросят. Если спросят — jump:price.',
      'Касание offer_question: спроси, всё ли понятно по направлениям, что заинтересовало — по образцам offer_question.',
      'Возражения («дорого», «подумаю», «не верю») отрабатывай по образцам objection, без давления.',
    ].join('\n'),
    requiredBlockKinds: [],
    allowedBlockKinds: [],
    exampleKinds: ['offer', 'offer_question', 'objection'],
    noQuestions: false,
  },
  {
    stage: 'price',
    goal: 'Назвать цены.',
    instructions: [
      'Вставь блок цен [[BLOCK:price]] дословно, перед ним — одна фраза-подводка под контекст.',
      'Скидку сверх блока не давай. Если клиент говорит «дорого» — отработай возражение по образцам objection и предложи начать с одного варианта.',
      'Касание price_question: короткий вопрос по образцам price_question — есть ли вопросы, что останавливает.',
      'Если клиент готов оплатить или спрашивает реквизиты — escalation ready_to_pay.',
    ].join('\n'),
    requiredBlockKinds: ['price'],
    allowedBlockKinds: ['price'],
    exampleKinds: ['price_question', 'objection'],
    noQuestions: false,
  },
  {
    stage: 'discount',
    goal: 'Дать скидку.',
    instructions: [
      'Вставь блок скидки [[BLOCK:discount]] дословно с короткой подводкой. Новых скидок сверх блока не придумывай.',
      'Заверши мягким вопросом, какой вариант откликается.',
    ].join('\n'),
    requiredBlockKinds: ['discount'],
    allowedBlockKinds: ['discount'],
    exampleKinds: ['discount', 'price_question'],
    noQuestions: false,
  },
  {
    stage: 'reminders',
    goal: 'Вернуть клиента в диалог, до трёх напоминаний.',
    instructions: [
      'Каждое напоминание — новый повод по образцам reminder, не повторяй предыдущие формулировки и не пересказывай предложение.',
      'Коротко, тепло, один вопрос. Без давления и без новых обещаний.',
    ].join('\n'),
    requiredBlockKinds: [],
    allowedBlockKinds: [],
    exampleKinds: ['reminder'],
    noQuestions: false,
  },
  {
    stage: 'closed_silent',
    goal: 'Воронка исчерпана — молчать, пока клиент не напишет.',
    instructions: [
      'Касаний нет. Если клиент напишет сам — ответь по фактам, тепло, и веди к оплате; при готовности платить — escalation ready_to_pay.',
    ].join('\n'),
    requiredBlockKinds: [],
    allowedBlockKinds: ['price'],
    exampleKinds: ['objection', 'price_question'],
    noQuestions: false,
  },
];
