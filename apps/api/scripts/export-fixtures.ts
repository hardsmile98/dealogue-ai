/**
 * Пополнение регрессионных фикстур из реальных ходов (раздел 15 ТЗ):
 * `npm run ai:fixtures [-- --account=<uuid>] [--limit=200]`.
 *
 * Берём ходы, исход которых объясняется записанным `analysis` (передача по
 * escalation, молчание, обычный ответ), обезличиваем тексты и сохраняем в
 * `src/ai/agent/stability/fixtures/exported.json`. Каждая фикстура тут же
 * проигрывается: расходится с записанным исходом — не берём, чтобы прогон
 * `npm test` оставался зелёным.
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dataSource from '../src/database/data-source.js';
import { replay, toFixture } from '../src/ai/agent/stability/fixtures.js';
import type { FixtureMessage, RegressionFixture } from '../src/ai/agent/stability/fixtures.js';

interface TurnRow {
  id: string;
  chat_id: string;
  stage_before: RegressionFixture['stage'] | null;
  trigger: RegressionFixture['trigger'];
  touch_kind: RegressionFixture['touchKind'];
  outcome: string;
  client_text: string;
  analysis: Record<string, unknown> | null;
  peer_name: string | null;
  peer_username: string | null;
  persona_name: string | null;
  handoff_reason: string | null;
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ai', 'agent', 'stability', 'fixtures', 'exported.json');
const HISTORY_LIMIT = 4;

async function main(): Promise<void> {
  const accountId = argValue('account');
  const limit = Number(argValue('limit') ?? 200);

  await dataSource.initialize();
  const turns = await dataSource.query<TurnRow[]>(
    `
    SELECT t."id", t."chat_id", t."stage_before", t."trigger", t."touch_kind", t."outcome",
           t."client_text", t."analysis",
           c."peer_name", c."peer_username",
           s."persona"->>'name' AS "persona_name",
           st."handoff_reason"
      FROM "ai_turns" t
      JOIN "telegram_chats" c ON c."id" = t."chat_id"
      LEFT JOIN "ai_account_settings" s ON s."account_id" = t."account_id"
      LEFT JOIN "ai_chat_state" st ON st."chat_id" = t."chat_id"
     WHERE t."analysis" IS NOT NULL
       AND t."client_text" <> ''
       AND t."outcome" IN ('handoff', 'silent', 'sent', 'dry_run')
       ${accountId ? 'AND t."account_id" = $2' : ''}
     ORDER BY t."created_at" DESC
     LIMIT $1
    `,
    accountId ? [limit, accountId] : [limit],
  );

  const fixtures: RegressionFixture[] = [];
  let skipped = 0;
  for (const row of turns) {
    const history = await loadHistory(row.chat_id);
    const fixture = toFixture({
      id: row.id,
      stage: row.stage_before,
      trigger: row.trigger,
      touchKind: row.touch_kind ?? null,
      outcome: row.outcome,
      clientText: row.client_text,
      history,
      analysis: row.analysis,
      handoffReason: (row.handoff_reason as RegressionFixture['expected']['reason']) ?? null,
      names: [row.peer_name, row.peer_username, row.persona_name].filter((n): n is string => Boolean(n)),
    });
    const result = replay(fixture);
    if (result.kind !== fixture.expected.kind) {
      skipped += 1;
      continue;
    }
    fixtures.push(fixture);
  }

  writeFileSync(OUT, `${JSON.stringify(fixtures, null, 2)}\n`, 'utf8');
  await dataSource.destroy();
  console.log(`Фикстур сохранено: ${fixtures.length}, пропущено (исход не воспроизводится кодом): ${skipped}`);
  console.log(OUT);
}

async function loadHistory(chatId: string): Promise<FixtureMessage[]> {
  const rows = await dataSource.query<{ direction: string; text: string; ai_turn_id: string | null; media_kind: string | null }[]>(
    `
    SELECT "direction", "text", "ai_turn_id", "media_kind"
      FROM "telegram_messages"
     WHERE "chat_id" = $1
     ORDER BY "telegram_message_id" DESC
     LIMIT ${HISTORY_LIMIT}
    `,
    [chatId],
  );
  return rows.reverse().map((row) => ({
    role: row.direction === 'in' ? 'client' : row.ai_turn_id ? 'bot' : 'manager',
    text: row.text,
    mediaKind: row.media_kind,
  }));
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
