/**
 * Собирает стандартную библиотеку из снимков Google-таблиц
 * (docs/source/funnel.xlsx, docs/source/diagnostics.xlsx) в
 * src/ai/library/seed/library-seed.ts. Соответствие ячеек — раздел 13 ТЗ
 * (docs/ai-agent-spec.md). Запуск: `npm run ai:seed:build`.
 *
 * Результат коммитится: API не читает xlsx в рантайме.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const funnelPath = resolve(root, 'docs/source/funnel.xlsx');
const diagPath = resolve(root, 'docs/source/diagnostics.xlsx');
const outPath = resolve(here, '../src/ai/library/seed/library-seed.ts');

const funnel = XLSX.read(readFileSync(funnelPath));
const diag = XLSX.read(readFileSync(diagPath));

/** Ячейка по человеческим координатам (строка и столбец с единицы). */
function cell(sheet, row, col) {
  const address = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  const value = sheet[address]?.v;
  if (value === undefined || value === null) return '';
  return normalize(String(value));
}

function normalize(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function require(sheet, row, col, label) {
  const value = cell(sheet, row, col);
  if (!value) throw new Error(`Пустая ячейка R${row}C${col} (${label})`);
  return value;
}

function sheetOf(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Нет листа «${name}» (есть: ${workbook.SheetNames.join(', ')})`);
  return sheet;
}

// --- фразы -----------------------------------------------------------------------

const F = sheetOf(funnel, 'воронка ру');
const M = sheetOf(funnel, 'наставничество');

const phrases = [];
let order = 0;
function phrase(p) {
  phrases.push({
    usage: 'example',
    language: 'ru',
    enabled: true,
    categoryKey: null,
    gender: null,
    ...p,
    sortOrder: order++,
  });
}

phrase({ kind: 'greeting', title: 'Первое сообщение', text: require(F, 2, 2, 'приветствие') });
phrase({ kind: 'birth_nudge', title: 'Не прислала дату', text: require(F, 4, 2, 'напоминание о дате') });
phrase({ kind: 'intro', title: 'Знакомство: что случилось', text: require(F, 6, 2, 'второе') });
phrase({ kind: 'intro', title: 'Знакомство: на какую сферу упор', text: require(F, 6, 3, 'второе (сферы)') });
phrase({ kind: 'intro', title: 'Знакомство: что беспокоит', text: require(F, 6, 4, 'второе (беспокоит)') });
phrase({ kind: 'ack_request', title: 'Понял запрос, займусь диагностикой', text: require(F, 8, 2, 'после ответа') });
phrase({ kind: 'ack_request', title: 'Понял вас, сделаю анализ', text: require(F, 8, 3, 'после ответа (коротко)') });
phrase({
  kind: 'ack_request',
  title: 'Если не дали запрос',
  text: require(F, 8, 6, 'если не дали запрос'),
  conditions: { requiresRequest: false },
});

const linksBlock = require(F, 9, 6, 'ссылки');
phrase({ usage: 'block', kind: 'links', title: 'Ссылки на страницы', text: linksBlock });

const noRequestClosing = require(F, 9, 5, 'без запроса, общий анализ');
const closingCut = noRequestClosing.indexOf('А так же');
phrase({
  kind: 'diag_closing',
  title: 'Не увидел запроса — общий анализ',
  text: closingCut > 0 ? normalize(noRequestClosing.slice(0, closingCut)) : noRequestClosing,
  conditions: { requiresRequest: false },
});

for (const [col, title] of [
  [2, 'Видео: гуру настраивается на ритуал'],
  [3, 'Видео: святое место'],
  [4, 'Видео: берег океана'],
]) {
  phrase({ kind: 'quick_reply', title, text: require(F, 9, col, title) });
}

for (const [col, title] of [
  [2, 'Что бы вы хотели изменить'],
  [3, 'Жду обратную связь по раскладу'],
  [4, 'Расскажите подробнее о ситуации'],
]) {
  phrase({ kind: 'reengage', title, text: require(F, 12, col, title) });
}
// Формулировки из требований владельца (docs/new-ai-agent.md, п. 5).
for (const text of [
  'Что из диагностики откликнулось вам больше всего?',
  'Удалось ознакомиться?',
  'Что вы увидели для себя в диагностике?',
  'Есть ли вопросы по тому, что я увидел?',
  'Насколько вам откликается то, что я описал?',
  'Есть ли что-то, что хотелось бы уточнить?',
]) {
  phrase({ kind: 'reengage', title: text, text });
}

phrase({
  kind: 'offer',
  title: 'Связка перед предложением (после игнора диагностики)',
  text: require(F, 13, 2, 'после диагностики игнор'),
  conditions: { requiresRequest: false },
});
phrase({ kind: 'objection', title: 'Сразу спрашивает про деньги', text: require(F, 14, 2, 'сразу про деньги') });

for (const col of [2, 3, 4, 5, 6, 7, 8, 9]) {
  const title = cell(F, 15, col) || `Вариант ${col}`;
  phrase({ kind: 'offer', title: `Описание услуги: ${title}`, text: require(F, 16, col, `описание услуги ${col}`), enabled: col === 9 });
}
phrase({ usage: 'block', kind: 'price', title: 'Цены: РОД', text: require(F, 16, 10, 'цены РОД') });

phrase({ kind: 'offer_question', title: 'Всё ли понятно по направлениям', text: require(F, 19, 2, 'вопрос при игноре') });
phrase({ kind: 'offer_question', title: 'Всё ли понятно, я открыт к диалогу', text: require(F, 19, 3, 'вопрос при игноре 2') });
phrase({ kind: 'objection', title: 'Выбрал комплекс: поддержать', text: require(F, 20, 2, 'эмпатия при выборе комплекса') });
phrase({ kind: 'objection', title: 'Выбрал комплекс: поддержать 2', text: require(F, 20, 3, 'эмпатия при выборе комплекса 2') });

for (const [col, title] of [
  [2, 'Цены: старая версия'],
  [4, 'Цены: по этапам'],
  [5, 'Цены: шаманский ритуал'],
  [6, 'Цены: энергопроводник'],
  [7, 'Цены: комплекс 150€'],
]) {
  phrase({ usage: 'block', kind: 'price', title, text: require(F, 22, col, title), enabled: false });
}
phrase({ usage: 'block', kind: 'price', title: 'Цены для СНГ', text: require(F, 22, 9, 'цена СНГ'), enabled: false });
phrase({ usage: 'block', kind: 'price', title: 'Цены для СНГ: комплекс', text: require(F, 22, 10, 'цена СНГ 2'), enabled: false });

for (const [row, title] of [
  [24, 'Понимаю, важный шаг — есть вопросы?'],
  [25, 'Время подходящее, энергия бьёт ключом'],
  [26, 'Вернём радость и гармонию?'],
  [27, 'Какие вопросы остались? Что останавливает?'],
]) {
  phrase({ kind: 'price_question', title, text: require(F, row, 2, title) });
}
for (const [row, col, title] of [
  [28, 2, 'Заняты или игнорируете?'],
  [29, 2, 'Так и не получил ответ, всё хорошо?'],
  [29, 3, 'Почувствовал изменения в энергополе'],
  [30, 2, 'Рассказать подробнее или прислать отзывы?'],
  [31, 2, 'Что-то смутило?'],
  [32, 2, 'Что заставляет задуматься?'],
]) {
  phrase({ kind: 'reminder', title, text: require(F, row, col, title) });
}
for (const [row, col, title] of [
  [26, 3, 'Видео в храме (подводка)'],
  [26, 4, 'Видео в храме'],
  [34, 2, 'Бесплатная практика (трипваер)'],
]) {
  phrase({ kind: 'quick_reply', title, text: require(F, row, col, title) });
}

phrase({
  usage: 'block',
  kind: 'discount',
  title: 'Скидка (заполните текст)',
  text: '[Заполните текст скидки: специальное предложение, срок, цена]',
  enabled: false,
});

// Наставничество — вторая линия, выключена.
const mentoring = [
  ['reengage', 3, 2, 'Потенциал ждёт раскрытия'],
  ['reengage', 3, 3, 'Энергия требует движения'],
  ['reengage', 3, 4, 'Время не стоит на месте'],
  ['empathy', 4, 2, 'Чувствую мощный потенциал'],
  ['empathy', 4, 3, 'Энергия полна скрытого дара'],
  ['offer', 6, 2, 'Курс: программа'],
  ['offer', 6, 3, 'Курс: трансформация'],
  ['price', 11, 2, 'Цены с обучением'],
  ['price', 11, 3, 'Цены курса: пакеты'],
  ['price_question', 13, 2, 'Не приняли решение'],
  ['price_question', 14, 2, 'Прочитали, но не ответили'],
  ['discount', 18, 2, 'Скидка: 2 места на обучение'],
  ['discount', 18, 3, 'Скидка: 2 места на сопровождение'],
];
for (const [kind, row, col, title] of mentoring) {
  phrase({
    usage: kind === 'price' || kind === 'discount' ? 'block' : 'example',
    kind,
    title: `Наставничество: ${title}`,
    text: require(M, row, col, `наставничество ${title}`),
    categoryKey: kind === 'empathy' ? 'mentoring.gift' : null,
    enabled: false,
  });
}

// --- факты -----------------------------------------------------------------------

const instagram = /https?:\/\/www\.instagram\.com\/\S+/.exec(linksBlock)?.[0] ?? 'https://www.instagram.com/';
const telegram = /https?:\/\/t\.me\/\S+/.exec(linksBlock)?.[0] ?? 'https://t.me/';

const facts = [
  ['link', 'link.instagram', 'Instagram', instagram],
  ['link', 'link.telegram', 'Telegram-канал', telegram],
  [
    'persona',
    'persona.origin',
    'Откуда',
    'Родился и вырос в Киеве, потом родители увезли на Бали; сейчас живёт во Франции, в городке Шамони-Монблан.',
  ],
  [
    'persona',
    'persona.experience',
    'Опыт',
    'Психотерапевт и энергопрактик, проходил инициацию в Колумбии; помогает людям более 15 лет.',
  ],
  [
    'process',
    'process.diagnostics',
    'Диагностика',
    'Бесплатная диагностика по дате и месту рождения; занимает около часа, результат присылается в чат.',
  ],
  [
    'service',
    'service.therapy',
    'Вариант 1 — совместная работа психотерапевт-клиент',
    'Индивидуальная онлайн-работа через общение, переписку, голосовые и практики; на связи 24/7. Длительность 1 месяц, количество сеансов и практик не ограничено — до результата. Работа с бессознательным и внутренними убеждениями: отношения, финансы, карьера, здоровье. Результат проявляется через 8–14 дней.',
  ],
  [
    'service',
    'service.cleaning',
    'Вариант 2 — энергетическая чистка',
    'Работа с энергополем: снятие негативных блоков в сфере финансов и отношений, разблокировка чакр. Участие клиента не нужно, отчётность предоставляется. Проводится за 2–3 дня.',
  ],
  [
    'service',
    'service.family',
    'Вариант 3 — работа с родом',
    'Восстановление баланса внутренней системы: работа с каждой чакрой, очищение от родовых сценариев, страхов и подавленных эмоций. Длительность 1 месяц, количество практик не ограничено.',
  ],
  [
    'process',
    'process.complex',
    'Комплекс',
    'Эффективнее всего брать комплексно — совмещать чистку с практиками: результат в разы быстрее (в среднем 14 дней) и закрепляется.',
  ],
  ['price', 'price.therapy', 'Цена: совместная работа', 'Обычная стоимость 200€, со скидкой для клиента — 130€ за месяц.'],
  ['price', 'price.cleaning', 'Цена: чистка', 'Обычная стоимость 105€, со скидкой — 75€.'],
  ['price', 'price.family', 'Цена: работа с родом', '120€, со скидкой — 95€.'],
  ['price', 'price.bundle_two', 'Цена: два варианта', '120€.'],
  ['price', 'price.bundle_all', 'Цена: все варианты (комплекс)', '150€.'],
  ['process', 'process.payment', 'Оплата', 'Способ оплаты и реквизиты обсуждает менеджер лично — бот их не называет.'],
].map(([group, key, title, value], index) => ({ group, key, title, value, enabled: true, sortOrder: index }));

// --- категории -------------------------------------------------------------------

const IN_RELATIONSHIP = {
  clarifyingFactKey: 'in_relationship',
  clarifyingQuestion: 'Подскажите, вы сейчас в отношениях или нет?',
};

const categories = [
  ['relationships.breakup', 'relationships', 'Расставание', 'Клиент переживает разрыв, развод, уход партнёра; хочет вернуть человека или пережить расставание.'],
  ['relationships.psych_astro', 'relationships', 'Психологическая + астрология', 'Отношения в целом, повторяющиеся сценарии, хочет понять себя и партнёров через психологию и натальную карту.'],
  ['relationships.single', 'relationships', 'Нет отношений / не могут построить', 'Одинок(а), не складываются отношения, не встречает подходящего партнёра.', IN_RELATIONSHIP],
  ['relationships.ex_conflict', 'relationships', 'Бывший партнёр или конфликт', 'Конфликт с партнёром или бывшим, ссоры, охлаждение, мысли о возврате.', IN_RELATIONSHIP],
  ['relationships.triangle', 'relationships', 'Любовный треугольник / измены', 'Измена, третий человек в отношениях, любовный треугольник.'],
  ['relationships.couple', 'relationships', 'В паре, хочет гармонии', 'В отношениях или браке, хочет наладить, укрепить, вернуть чувства.'],
  ['money.love', 'money', 'Финансы + любовь', 'Одновременно беспокоят деньги и личная жизнь.'],
  ['money.work', 'money', 'Финансы + работа', 'Деньги и карьера: работа не приносит дохода, нет роста, хочет сменить работу.'],
  ['money.sudden_loss', 'money', 'Резкая потеря денег', 'Внезапно потерял(а) деньги, бизнес, доход; долги после потери.'],
  ['money.instability', 'money', 'Финансовая нестабильность', 'Доход скачет, денег не хватает, долги, ощущение «деньги утекают».'],
  ['money.more', 'money', 'Хочет больше денег', 'Доход есть, но хочет больше, выйти на новый уровень, открыть финансовый поток.'],
  ['money.second_business', 'money', 'Хочет открыть второй бизнес', 'Есть дело, думает о новом направлении или втором бизнесе, сомневается.'],
  ['money.relationships', 'money', 'Финансы + отношения (пара)', 'В паре, и беспокоят деньги в семье, финансовые конфликты с партнёром.'],
  ['money.health', 'money', 'Финансы + здоровье', 'Одновременно деньги и здоровье: болезни мешают зарабатывать или наоборот.'],
  ['health.own', 'health', 'Здоровье', 'Своё здоровье: хронические болезни, усталость, боли, недомогание без причины.'],
  ['health.child', 'health', 'Здоровье ребёнка', 'Болеет ребёнок, тревога за его здоровье.'],
  ['family.child', 'family', 'Семья (ребёнок)', 'Отношения с ребёнком, его поведение, учёба, семья в целом.'],
  ['family.childbearing', 'family', 'Деторождение', 'Хочет ребёнка, не получается забеременеть, потери беременности.'],
  ['universal.seven_roads', 'universal', '7 дорог', 'Не знает, куда двигаться, много вариантов, нет направления; общий запрос «что делать дальше».'],
  ['universal.chakras', 'universal', 'Заблокированы чакры', 'Упадок сил, апатия, ощущение блоков, «ничего не идёт», общий энергетический запрос.'],
  ['future.general', 'universal', 'На будущее', 'Хочет узнать, что ждёт впереди, прогноз без конкретной проблемы.'],
  ['future.3m', 'universal', 'На будущее (3 месяца)', 'Прогноз на ближайшие месяцы, конкретный горизонт.'],
  ['other.phobia_insects', 'other', 'Боязнь насекомых', 'Фобия насекомых или другой конкретный страх.'],
  ['other.relocation', 'other', 'Переезд', 'Планирует или пережил переезд, эмиграцию, смену города.'],
  ['request.card_reading', 'other', 'Просит карту / разбор', 'Прямо просит натальную карту, расклад, разбор личности без описания проблемы.'],
  ['mentoring.gift', 'mentoring', 'Наставничество (про дар)', 'Интересуется своим даром, способностями, хочет учиться энергопрактикам.', null, false],
  ['mentoring.potential', 'mentoring', 'Наставничество (про потенциал)', 'Хочет раскрыть потенциал, стать практиком, пройти обучение.', null, false],
].map(([key, groupKey, title, description, clarify, enabled], index) => ({
  key,
  groupKey,
  title,
  description,
  clarifyingFactKey: clarify?.clarifyingFactKey ?? null,
  clarifyingQuestion: clarify?.clarifyingQuestion ?? null,
  enabled: enabled !== false,
  sortOrder: index,
}));

const categoryTitle = new Map(categories.map((c) => [c.key, c.title]));

// --- диагностики ------------------------------------------------------------------

const diagnostics = [];
const usedKeys = new Set();
let diagOrder = 0;
function diagnostic({ sheet, row, col, categoryKey, gender, language, label, enabled = true }) {
  const text = cell(sheet, row, col);
  if (!text) return;
  const base = `${categoryKey ?? 'universal'}${label ? `.${label}` : ''}.${gender ?? 'any'}.${language}`;
  let key = base;
  for (let n = 2; usedKeys.has(key); n += 1) key = `${base}.${n}`;
  usedKeys.add(key);
  const who = gender === 'f' ? 'женщинам' : gender === 'm' ? 'мужчинам' : 'всем';
  const title = `${categoryKey ? categoryTitle.get(categoryKey) ?? categoryKey : 'Универсальная'}${label ? ` (${label})` : ''} — ${who}${language === 'en' ? ', EN' : ''}`;
  diagnostics.push({ key, title: title.slice(0, 128), categoryKey: categoryKey ?? null, gender: gender ?? null, language, text, enabled, sortOrder: diagOrder++ });
}

const D = sheetOf(diag, 'Диагностики (новые)');
const NEW_COLUMNS = [
  'relationships.breakup',
  'relationships.psych_astro',
  'relationships.single',
  'relationships.ex_conflict',
  'relationships.triangle',
  'money.love',
  'money.work',
  'money.sudden_loss',
  'money.instability',
  'money.more',
  'universal.seven_roads',
  'universal.chakras',
  'health.own',
  'family.child',
  'other.phobia_insects',
  'money.second_business',
  'health.child',
  'family.childbearing',
  'money.relationships',
  'money.health',
  'mentoring.gift',
  'mentoring.potential',
  'future.general',
  'future.3m',
  'other.relocation',
];
NEW_COLUMNS.forEach((categoryKey, index) => {
  const col = index + 1;
  const enabled = !categoryKey.startsWith('mentoring.');
  diagnostic({ sheet: D, row: 4, col, categoryKey, gender: 'f', language: 'ru', enabled });
  diagnostic({ sheet: D, row: 6, col, categoryKey, gender: 'm', language: 'ru', enabled });
  diagnostic({ sheet: D, row: 8, col, categoryKey, gender: null, language: 'en', enabled });
});

const U = sheetOf(diag, 'Универсальные');
const UNIVERSAL = [
  [1, null, null, 'вариант 1'],
  [3, null, null, 'вариант 2'],
  [5, null, 'f', 'женский энергофункционал'],
  [7, 'relationships.couple', null, 'вариант 4'],
  [9, null, null, 'вариант 5'],
  [11, 'relationships.couple', null, 'вариант 6'],
  [13, null, null, 'вариант 7'],
];
for (const [col, categoryKey, gender, label] of UNIVERSAL) {
  diagnostic({ sheet: U, row: 2, col, categoryKey, gender, language: 'ru', label });
}
for (const [col, categoryKey, gender, label] of UNIVERSAL.slice(0, 4)) {
  diagnostic({ sheet: U, row: 11, col, categoryKey, gender, language: 'en', label });
}

const R = sheetOf(diag, 'Отношения');
diagnostic({ sheet: R, row: 2, col: 1, categoryKey: 'relationships.single', gender: null, language: 'ru', label: 'одиноким' });
diagnostic({ sheet: R, row: 2, col: 3, categoryKey: 'relationships.couple', gender: null, language: 'ru', label: 'пара' });
diagnostic({ sheet: R, row: 7, col: 1, categoryKey: 'relationships.single', gender: null, language: 'en', label: 'одиноким' });
diagnostic({ sheet: R, row: 7, col: 3, categoryKey: 'relationships.couple', gender: null, language: 'en', label: 'пара' });

const FM = sheetOf(diag, 'Финансы и мужчинам');
diagnostic({ sheet: FM, row: 2, col: 1, categoryKey: 'money.instability', gender: null, language: 'ru', label: 'финансы' });
diagnostic({ sheet: FM, row: 2, col: 3, categoryKey: 'relationships.couple', gender: 'm', language: 'ru', label: 'мужская' });
diagnostic({ sheet: FM, row: 2, col: 5, categoryKey: null, gender: 'm', language: 'ru', label: 'мужская 1' });
diagnostic({ sheet: FM, row: 2, col: 7, categoryKey: null, gender: 'm', language: 'ru', label: 'мужская 2' });
diagnostic({ sheet: FM, row: 10, col: 1, categoryKey: 'money.instability', gender: null, language: 'en', label: 'финансы' });
diagnostic({ sheet: FM, row: 10, col: 3, categoryKey: 'relationships.couple', gender: 'm', language: 'en', label: 'мужская' });

const C = sheetOf(diag, 'По запросу КАРТА и РАЗБОР');
diagnostic({ sheet: C, row: 2, col: 1, categoryKey: 'request.card_reading', gender: null, language: 'ru', label: 'вариант 1' });
diagnostic({ sheet: C, row: 2, col: 3, categoryKey: 'request.card_reading', gender: null, language: 'ru', label: 'вариант 2' });
diagnostic({ sheet: C, row: 2, col: 5, categoryKey: 'request.card_reading', gender: null, language: 'ru', label: 'вариант 3' });
diagnostic({ sheet: C, row: 7, col: 1, categoryKey: 'request.card_reading', gender: null, language: 'en', label: 'вариант 1' });

// --- запись -------------------------------------------------------------------------

const seed = {
  generatedAt: new Date().toISOString().slice(0, 10),
  categories,
  phrases,
  facts,
  diagnostics,
};

const header = `/**
 * Стандартная библиотека ИИ-агента. Сгенерировано scripts/build-library-seed.mjs
 * из docs/source/*.xlsx — не править руками, пересобрать: npm run ai:seed:build.
 */
import type { LibrarySeed } from './seed.types.js';

export const LIBRARY_SEED: LibrarySeed = `;

writeFileSync(outPath, `${header}${JSON.stringify(seed, null, 2)};\n`, 'utf8');
console.log(
  `Записано ${outPath}: категорий ${categories.length}, фраз ${phrases.length}, фактов ${facts.length}, диагностик ${diagnostics.length}`,
);
