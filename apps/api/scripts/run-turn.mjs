// Живой прогон ядра хода: реальная база и DeepSeek, канал в памяти, без Telegram.
// Запуск из apps/api после nest build: TELEGRAM_API_ID= TELEGRAM_API_HASH= BOT_ACCOUNT_ID=<uuid> node scripts/run-turn.mjs
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../dist/app.module.js';
import { TurnRunnerService } from '../dist/bot/services/turn-runner.service.js';
import { BotChatStateRepository } from '../dist/bot/repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../dist/bot/repositories/bot-jobs.repository.js';

const ACCOUNT = process.env.BOT_ACCOUNT_ID ?? '';
if (!ACCOUNT) {
  console.error('Укажите BOT_ACCOUNT_ID=<uuid аккаунта>');
  process.exit(1);
}
const CHAT = randomUUID();

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
const runner = app.get(TurnRunnerService);
const states = app.get(BotChatStateRepository);
const jobs = app.get(BotJobsRepository);
const db = app.get(DataSource);

const history = [];
let nextId = 1;
let minute = 0;
const T0 = Date.now();
const clock = {
  now: () => new Date(T0 + minute * 60_000),
  sleep: async () => {},
};
const channel = {
  send: async (_chat, text) => {
    const id = nextId++;
    history.push({
      id,
      direction: 'out',
      text,
      mediaKind: null,
      sentAt: clock.now(),
      readAt: null,
    });
    return { messageId: id };
  },
  setTyping: async () => {},
  markRead: async () => {},
  history: async () => history.slice(),
};
const incoming = (text, mediaKind = null) => {
  const id = nextId++;
  const message = { id, text, mediaKind, sentAt: clock.now() };
  history.push({ ...message, direction: 'in', readAt: null });
  return message;
};
const readAll = () =>
  history.forEach((m) => {
    if (m.direction === 'out' && !m.readAt) m.readAt = clock.now();
  });

let seq = 0;
async function clientTurn(texts) {
  const messages = texts.map((t) => incoming(t));
  seq += 1;
  const started = Date.now();
  const result = await runner.run(
    {
      chatId: CHAT,
      accountId: ACCOUNT,
      trigger: 'client',
      messages,
      job: null,
      generationSeq: seq,
    },
    { channel, clock, isStale: () => false },
  );
  report(`КЛИЕНТ: ${texts.join(' | ')}`, result, started);
  return result;
}
async function scheduleTurn(kind) {
  await jobs.createMany(CHAT, [{ kind, runAt: clock.now() }]);
  const [job] = await db.query(
    `SELECT id FROM bot_jobs WHERE chat_id = $1 AND kind = $2 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [CHAT, kind],
  );
  const started = Date.now();
  const result = await runner.run(
    {
      chatId: CHAT,
      accountId: ACCOUNT,
      trigger: 'schedule',
      messages: [],
      job: { id: job.id, kind },
      generationSeq: seq,
    },
    { channel, clock, isStale: () => false },
  );
  report(`РАСПИСАНИЕ: ${kind}`, result, started);
  return result;
}
function report(label, result, started) {
  console.log(`\n=== ${label}`);
  console.log(
    `status=${result.status} stage=${result.stage} handoff=${result.handoff ?? '-'} ${Date.now() - started} мс ${result.error ? 'error=' + result.error : ''}`,
  );
  for (const part of result.sent)
    console.log(
      `  → [${part.text.length > 300 ? part.text.slice(0, 300).replace(/\n/g, ' ') + '…' : part.text.replace(/\n/g, ' ')}]`,
    );
}

try {
  await states.setMode(CHAT, ACCOUNT, 'auto');
  await db.query(
    `UPDATE bot_chat_state SET sandbox = true WHERE chat_id = $1`,
    [CHAT],
  );

  await clientTurn([
    'Здравствуйте Марсель! Хочу получить бесплатный расклад от Вас! код: 12',
  ]);
  minute += 3;
  await clientTurn([
    '04.01.1999, Москва',
    'финансы. муж ушёл три месяца назад, с деньгами совсем тяжело стало',
    'а вы сами где живёте?',
  ]);
  minute += 5;
  await clientTurn([
    'а сколько стоит работа с вами?',
    'и сколько ждать расклад?',
  ]);
  minute += 2;
  await clientTurn(['ok 👍']);
  minute += 60;
  await scheduleTurn('diagnostic');
  readAll();
  minute += 20;
  await clientTurn([
    'Прочитала. Многое откликается, особенно про блоки на деньги. Что с этим делать?',
  ]);
  readAll();
  minute += 10;
  await clientTurn(['Понятно. А сколько это стоит?']);

  const turns = await db.query(
    `SELECT trigger, status, plan->>'goal' AS goal, review, final->'removed' AS removed, error FROM bot_turns WHERE chat_id = $1 ORDER BY started_at`,
    [CHAT],
  );
  console.log('\n=== ЖУРНАЛ');
  for (const turn of turns) {
    console.log(
      `- ${turn.trigger}/${turn.status}: ${String(turn.goal ?? '')
        .replace(/\n/g, ' ')
        .slice(0, 220)}`,
    );
    if (turn.review?.violations?.length)
      console.log(`  проверяющий: ${JSON.stringify(turn.review.violations)}`);
    if (turn.removed?.length)
      console.log(`  вырезано: ${JSON.stringify(turn.removed)}`);
    if (turn.error) console.log(`  ошибка: ${turn.error}`);
  }
  const [state] = await db.query(
    `SELECT mode, handoff_reason, label, card, summary, turns_without_nudge, reminders_sent FROM bot_chat_state WHERE chat_id = $1`,
    [CHAT],
  );
  console.log('\n=== СОСТОЯНИЕ', JSON.stringify(state));
  const facts = await db.query(
    `SELECT kind, text, status FROM bot_client_facts WHERE chat_id = $1 ORDER BY created_at`,
    [CHAT],
  );
  console.log('=== ФАКТЫ', JSON.stringify(facts));
  const said = await db.query(
    `SELECT kind, key FROM bot_chat_said WHERE chat_id = $1 ORDER BY at`,
    [CHAT],
  );
  console.log('=== СКАЗАНО', JSON.stringify(said));
  const usage = await db.query(
    `SELECT kind, count(*)::int AS n, sum(length(request))::int AS req, sum(length(response))::int AS res FROM bot_prompt_snapshots WHERE turn_id IN (SELECT id FROM bot_turns WHERE chat_id = $1) GROUP BY kind`,
    [CHAT],
  );
  console.log('=== ПРОМПТЫ', JSON.stringify(usage));
} finally {
  if (process.env.KEEP !== '1')
    await db.query(`DELETE FROM bot_chat_state WHERE chat_id = $1`, [CHAT]);
  await app.close();
}
