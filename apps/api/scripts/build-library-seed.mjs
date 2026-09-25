/**
 * Собирает стандартную библиотеку агента из таблиц docs/source/*.xlsx в
 * src/bot/library/seed/default-library.json. Разовая операция: в рантайме
 * таблицы не читаются, импорт в аккаунт идёт из JSON.
 *
 *   1. Распаковать xlsx как zip:  funnel.xlsx → <dir>/funnel, diagnostics.xlsx → <dir>/diagnostics
 *      (PowerShell: Copy-Item x.xlsx x.zip; Expand-Archive x.zip <dir>/x)
 *   2. node scripts/build-library-seed.mjs <dir>
 *   3. npm test — default-library.spec.ts проверяет собранный сид.
 *
 * Соответствие ячеек видам библиотеки — ниже в коде (add / addDiag);
 * docs/source/README.md описывает то же словами.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from './read-xlsx.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('Укажите папку с распакованными таблицами: funnel/ и diagnostics/');
  process.exit(1);
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/bot/library/seed/default-library.json');

const funnel = readWorkbook(path.join(dir, 'funnel'))['воронка ру'];
const diag = readWorkbook(path.join(dir, 'diagnostics'));

/** Биография старого образа из таблиц — уходит в образ по умолчанию, в текстах заменяется на {{bio}}. */
const BIO = 'Я сам родился и вырос в Киеве, потом родители увезли на Бали. Сейчас вот обитаю во Франции, в городке Шамони-Монблан.';
/** Хвост со ссылками старого аккаунта — заменяется на {{links}} из образа. */
const LINKS_TAIL = /\n*🔮 Instagram:[\s\S]*$/u;

const items = [];
const seen = new Map();
function add(seedKey, kind, cell, text, extra = {}) {
  if (!text) throw new Error(`пустая ячейка ${cell} для ${seedKey}`);
  const item = { seedKey, kind, language: 'ru', gender: null, category: null, title: '', sort: items.length, enabled: true, ...extra, text };
  if (!item.title) throw new Error(`нет title у ${seedKey}`);
  items.push(item);
}
const f = (cell) => funnel[cell];

// --- лист «воронка ру» ---
add('funnel.B2', 'greeting', 'B2', f('B2'), { title: 'Первое сообщение' });
add('funnel.B4', 'no_birth_data', 'B4', f('B4'), { title: 'Не прислал дату' });
['B6', 'C6', 'D6'].forEach((c, i) => add(`funnel.${c}`, 'ask_request', c, f(c).replace(BIO, '{{bio}}'), { title: `Знакомство и вопрос о запросе, вариант ${i + 1}` }));
add('funnel.B8', 'wait', 'B8', f('B8'), { title: 'После запроса, вариант 1' });
add('funnel.C8', 'wait', 'C8', f('C8'), { title: 'После запроса, вариант 2' });
add('funnel.F8', 'wait', 'F8', f('F8'), { title: 'Без запроса', category: 'no_request' });
add('funnel.F9', 'links', 'F9', f('F9').replace(LINKS_TAIL, '\n\n{{links}}'), { title: 'Ссылки на страницы' });
add('funnel.E9', 'links', 'E9', f('E9').replace(LINKS_TAIL, '\n\n{{links}}'), { title: 'Ссылки и общий анализ (без запроса)', category: 'no_request' });
['B12', 'C12', 'D12'].forEach((c, i) => add(`funnel.${c}`, 'return_question', c, f(c), { title: `После диагностики, вариант ${i + 1}` }));
add('funnel.B13', 'nudge', 'B13', f('B13'), { title: 'Связка перед предложением после молчания', category: 'diagnostic_silent' });
add('funnel.B14', 'price_deflect', 'B14', f('B14'), { title: 'Сразу про деньги после диагностики' });
const offerTitles = { B: 'старое с мотивацией ОТ', C: 'старое с мотивацией ОТ, мужчинам', D: 'старое, более нативное, начиная с чистки', E: 'старое переписанное', F: 'с мотивацией К', G: 'короткое', H: 'тест после рода', I: 'род' };
for (const [col, title] of Object.entries(offerTitles)) {
  add(`funnel.${col}16`, 'offer', `${col}16`, f(`${col}16`), { title: `Описание услуг: ${title}`, enabled: col === 'B', gender: col === 'C' ? 'm' : null });
}
add('funnel.J16', 'prices', 'J16', f('J16'), { title: 'Цены: род', enabled: false });
add('funnel.B22', 'prices', 'B22', f('B22'), { title: 'Цены' });
['D22', 'E22', 'F22', 'G22'].forEach((c, i) => add(`funnel.${c}`, 'prices', c, f(c), { title: `Цены, вариант ${i + 2}`, enabled: false }));
add('funnel.I22', 'prices', 'I22', f('I22'), { title: 'Цены для СНГ', enabled: false });
add('funnel.J22', 'prices', 'J22', f('J22'), { title: 'Цены для СНГ, вариант 2', enabled: false });
add('funnel.B19', 'nudge', 'B19', f('B19'), { title: 'Вопрос после предложения, вариант 1', category: 'offer' });
add('funnel.C19', 'nudge', 'C19', f('C19'), { title: 'Вопрос после предложения, вариант 2', category: 'offer' });
add('funnel.B20', 'empathy', 'B20', f('B20'), { title: 'Выбрал комплекс, вариант 1', category: 'chose_complex' });
add('funnel.C20', 'empathy', 'C20', f('C20'), { title: 'Выбрал комплекс, вариант 2', category: 'chose_complex' });
add('funnel.B24', 'objection', 'B24', f('B24'), { title: 'Подумаю: есть ли вопросы', category: 'think_about_it' });
add('funnel.B30', 'objection', 'B30', f('B30'), { title: 'Не верит: рассказать о процессе, прислать отзывы', category: 'dont_believe' });
add('funnel.B31', 'objection', 'B31', f('B31'), { title: 'Подумаю: что смутило', category: 'think_about_it' });
add('funnel.B32', 'objection', 'B32', f('B32'), { title: 'Подумаю: что заставляет задуматься', category: 'think_about_it' });
// Не импортируются: C4 («вибрации»), B9–D9 и C26/D26 (видео), B34 (бесплатная практика),
// B25–B29 (касания после цен — после цен агент выключен), лист «наставничество».

// --- диагностики ---
function addDiag(seedKey, sheet, cell, { category, gender = null, language = 'ru', title }) {
  const text = diag[sheet]?.[cell];
  if (!text) throw new Error(`нет диагностики ${sheet}!${cell}`);
  const dup = seen.get(text);
  if (dup) {
    console.error(`дубликат текста: ${seedKey} = ${dup}, пропущен`);
    return;
  }
  seen.set(text, seedKey);
  add(seedKey, 'diagnostic', `${sheet}!${cell}`, text, { category, gender, language, title });
}
const NEW = 'Диагностики (новые)';
// Колонка → категория; строка 4 — женщинам, 6 — мужчинам, 8 — английские (любой пол). U, V — наставничество, не берём.
const newCols = {
  A: ['relationships.breakup', 'Расставание'], B: ['relationships.psych_astro', 'Психология и астрология'],
  C: ['relationships.single', 'Нет отношений'], D: ['relationships.ex_conflict', 'Бывший партнёр или конфликт'],
  E: ['relationships.triangle', 'Любовный треугольник, измены'], F: ['money.love', 'Финансы и любовь'],
  G: ['money.work', 'Финансы и работа'], H: ['money.sudden_loss', 'Резкая потеря денег'],
  I: ['money.instability', 'Финансовая нестабильность'], J: ['money.more', 'Хочет больше денег'],
  K: ['universal.seven_roads', '7 дорог'], L: ['universal.chakras', 'Заблокированы чакры'],
  M: ['health.own', 'Здоровье'], N: ['family.child', 'Семья, ребёнок'], O: ['other.phobia_insects', 'Боязнь насекомых'],
  P: ['money.second_business', 'Второй бизнес'], Q: ['health.child', 'Здоровье ребёнка'], R: ['family.childbearing', 'Деторождение'],
  S: ['money.relationships', 'Финансы и отношения в паре'], T: ['money.health', 'Финансы и здоровье'],
  W: ['future.general', 'На будущее'], X: ['future.3m', 'На будущее, 3 месяца'], Y: ['other.relocation', 'Переезд'],
};
for (const [col, [category, title]] of Object.entries(newCols)) {
  for (const [row, gender, language, suffix] of [[4, 'f', 'ru', 'женщинам'], [6, 'm', 'ru', 'мужчинам'], [8, null, 'en', 'English']]) {
    if (diag[NEW][`${col}${row}`]) addDiag(`diag.new.${col}${row}`, NEW, `${col}${row}`, { category, gender, language, title: `${title}, ${suffix}` });
  }
}
const UNI = 'Универсальные';
addDiag('diag.universal.A2', UNI, 'A2', { category: 'universal.general', title: 'Универсальная 1' });
addDiag('diag.universal.C2', UNI, 'C2', { category: 'universal.general', title: 'Универсальная 2 (прогноз)' });
addDiag('diag.universal.E2', UNI, 'E2', { category: 'universal.general', gender: 'f', title: 'Универсальная 3, женский энергофункционал' });
addDiag('diag.universal.G2', UNI, 'G2', { category: 'relationships.couple', gender: 'f', title: 'Отношения в паре, вариант 1' });
addDiag('diag.universal.I2', UNI, 'I2', { category: 'universal.general', title: 'Универсальная 5' });
addDiag('diag.universal.K2', UNI, 'K2', { category: 'relationships.couple', gender: 'f', title: 'Отношения в паре, вариант 2' });
addDiag('diag.universal.M2', UNI, 'M2', { category: 'universal.general', title: 'Универсальная 7' });
addDiag('diag.universal.A11', UNI, 'A11', { category: 'universal.general', language: 'en', title: 'Universal 1' });
addDiag('diag.universal.C11', UNI, 'C11', { category: 'universal.general', language: 'en', title: 'Universal 2 (forecast)' });
addDiag('diag.universal.E11', UNI, 'E11', { category: 'universal.general', gender: 'f', language: 'en', title: 'Universal 3, feminine' });
addDiag('diag.universal.G11', UNI, 'G11', { category: 'relationships.couple', gender: 'f', language: 'en', title: 'Couple relationships' });
const REL = 'Отношения';
addDiag('diag.relationships.A2', REL, 'A2', { category: 'relationships.single', gender: 'f', title: 'Одиноким' });
addDiag('diag.relationships.C2', REL, 'C2', { category: 'relationships.couple', gender: 'f', title: 'Пара' });
addDiag('diag.relationships.A7', REL, 'A7', { category: 'relationships.single', language: 'en', title: 'Single' });
addDiag('diag.relationships.C7', REL, 'C7', { category: 'relationships.couple', language: 'en', title: 'Couple' });
const FIN = 'Финансы и мужчинам';
addDiag('diag.finance.A2', FIN, 'A2', { category: 'money.instability', title: 'Финансы' });
addDiag('diag.finance.C2', FIN, 'C2', { category: 'relationships.couple', gender: 'm', title: 'Мужская универсальная, отношения' });
addDiag('diag.finance.E2', FIN, 'E2', { category: 'universal.general', gender: 'm', title: 'Универсальная для мужчин, вариант 1' });
addDiag('diag.finance.G2', FIN, 'G2', { category: 'universal.general', gender: 'm', title: 'Универсальная для мужчин, вариант 2' });
addDiag('diag.finance.A10', FIN, 'A10', { category: 'money.instability', language: 'en', title: 'Finances' });
addDiag('diag.finance.C10', FIN, 'C10', { category: 'relationships.couple', gender: 'm', language: 'en', title: 'Relationships, men' });
const REQ = 'По запросу КАРТА и РАЗБОР';
addDiag('diag.request.A2', REQ, 'A2', { category: 'request.card_reading', title: 'Карта и разбор, вариант 1' });
addDiag('diag.request.C2', REQ, 'C2', { category: 'request.card_reading', title: 'Карта и разбор, вариант 2' });
addDiag('diag.request.E2', REQ, 'E2', { category: 'request.card_reading', title: 'Карта и разбор, вариант 3' });
addDiag('diag.request.A7', REQ, 'A7', { category: 'request.card_reading', language: 'en', title: 'Card reading' });
// Листы с «ТЕСТ» не в работе — не импортируются.

const seed = {
  version: 1,
  source: 'docs/source/funnel.xlsx (лист «воронка ру»), docs/source/diagnostics.xlsx — снимки от 17.09.2026',
  persona: { gender: 'm', bio: BIO },
  items,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(seed, null, 2) + '\n', 'utf8');
const byKind = {};
for (const item of items) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
console.log(`items: ${items.length}`, byKind, `→ ${path.relative(process.cwd(), out)}`);
