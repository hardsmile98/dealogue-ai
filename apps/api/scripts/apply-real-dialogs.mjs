/**
 * Подстройка агента под реальную переписку (docs/real-dialogs-report.md) — в
 * библиотеках аккаунтов. Повторяемо: можно запускать сколько угодно раз.
 *
 *   node scripts/apply-real-dialogs.mjs [--dry-run] [--revert] [accountId ...]
 *
 * Без accountId — все аккаунты, у которых уже есть библиотека агента. Что
 * делает:
 *   1. Добавляет элементы стандартной библиотеки, которых в аккаунте нет (как
 *      импорт с mode: keep, — это фразы real.*).
 *   2. Меняет текст элементов из `UPDATED`, если он ещё прежний (правленный
 *      руками не трогает): открытый вопрос о сфере `agent.ask_sphere` и
 *      «работаю онлайн» с репликой из реальной переписки.
 * --revert удаляет добавленные элементы real.* и возвращает прежний вопрос о
 * сфере, если его текст не правили.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(
  fs.readFileSync(
    path.join(here, '../src/bot/library/seed/default-library.json'),
    'utf8',
  ),
);
const seedItem = (seedKey) =>
  seed.items.find((item) => item.seedKey === seedKey);

/** Элементы, у которых поменялся текст: прежние заголовок и текст. */
const UPDATED = [
  {
    seedKey: 'agent.ask_sphere',
    title: 'Вопрос о сфере (данные пришли без неё)',
    text: 'Подскажите, на какую сферу жизни сделать упор в анализе? Отношения, финансы, здоровье или самореализация?',
  },
  {
    seedKey: 'real.about.online',
    title: 'Работаете онлайн? Важно ли, где я нахожусь?',
    text: 'Работаю онлайн, расстояние значения не имеет.',
  },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const revert = args.includes('--revert');
const ids = args.filter((arg) => !arg.startsWith('--'));

const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
await client.connect();

const accounts = ids.length
  ? ids
  : (
      await client.query(
        'SELECT DISTINCT account_id FROM bot_library_items ORDER BY account_id',
      )
    ).rows.map((row) => row.account_id);

try {
  await client.query('BEGIN');
  for (const accountId of accounts) {
    const report = revert
      ? await revertAccount(accountId)
      : await applyAccount(accountId);
    console.log(accountId, JSON.stringify(report));
  }
  await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  if (dryRun) console.log('--dry-run: изменения откатены');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

/** Заменить заголовок и текст элемента, если его текст ещё `from`. */
async function replaceText(accountId, seedKey, from, to) {
  const result = await client.query(
    `UPDATE bot_library_items SET title = $4, text = $5, updated_at = now()
     WHERE account_id = $1 AND seed_key = $2 AND text = $3`,
    [accountId, seedKey, from.text, to.title, to.text],
  );
  return result.rowCount;
}

async function applyAccount(accountId) {
  const existing = new Set(
    (
      await client.query(
        'SELECT seed_key FROM bot_library_items WHERE account_id = $1 AND seed_key IS NOT NULL',
        [accountId],
      )
    ).rows.map((row) => row.seed_key),
  );
  let inserted = 0;
  for (const item of seed.items) {
    if (existing.has(item.seedKey)) continue;
    await client.query(
      `INSERT INTO bot_library_items
         (account_id, seed_key, kind, language, gender, category, title, text, sort, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        accountId,
        item.seedKey,
        item.kind,
        item.language,
        item.gender,
        item.category,
        item.title,
        item.text,
        item.sort,
        item.enabled,
      ],
    );
    inserted += 1;
  }
  let updated = 0;
  for (const previous of UPDATED) {
    updated += await replaceText(
      accountId,
      previous.seedKey,
      previous,
      seedItem(previous.seedKey),
    );
  }
  return { inserted, updated };
}

async function revertAccount(accountId) {
  const removed = await client.query(
    "DELETE FROM bot_library_items WHERE account_id = $1 AND seed_key LIKE 'real.%'",
    [accountId],
  );
  let restored = 0;
  for (const previous of UPDATED) {
    restored += await replaceText(
      accountId,
      previous.seedKey,
      seedItem(previous.seedKey),
      previous,
    );
  }
  return { deleted: removed.rowCount, restored };
}
