// Живая проверка поллера лестницы: боевой чат с каналом в памяти (без Telegram).
// Запуск из apps/api после nest build: TELEGRAM_API_ID= TELEGRAM_API_HASH= BOT_SCHEDULER_POLL_MS=0 BOT_ACCOUNT_ID=<uuid> node scripts/run-ladder.mjs
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../dist/app.module.js';
import { BotSchedulerService } from '../dist/bot/services/bot-scheduler.service.js';
import { BotLadderService } from '../dist/bot/services/bot-ladder.service.js';
import { BotChatStateRepository } from '../dist/bot/repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../dist/bot/repositories/bot-jobs.repository.js';

const ACCOUNT = process.env.BOT_ACCOUNT_ID ?? '';
if (!ACCOUNT) { console.error('Укажите BOT_ACCOUNT_ID=<uuid аккаунта>'); process.exit(1); }
const CHAT = randomUUID();
const SANDBOX_CHAT = randomUUID();

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
const scheduler = app.get(BotSchedulerService);
const ladder = app.get(BotLadderService);
const states = app.get(BotChatStateRepository);
const jobs = app.get(BotJobsRepository);
const db = app.get(DataSource);

const history = [];
let nextId = 1;
let failSends = false;
const channel = {
  send: async (_chat, text) => {
    if (failSends) throw new Error('канал недоступен (проверка повтора)');
    const id = nextId++;
    history.push({ id, direction: 'out', text, mediaKind: null, sentAt: new Date(), readAt: null });
    return { messageId: id };
  },
  setTyping: async () => {},
  markRead: async () => {},
  history: async () => history.slice(),
};
// Ход по заданию ждёт настоящие задержки доставки — в проверке они не нужны.
const clock = { now: () => new Date(), sleep: async () => {} };
scheduler.registerChannels({
  environment: (chatId) => (chatId === CHAT ? { channel, clock, isStale: () => false } : null),
  isCollecting: () => false,
});

const pendingJobs = async (chatId) =>
  db.query(`SELECT kind, run_at, status, payload FROM bot_jobs WHERE chat_id = $1 ORDER BY created_at`, [chatId]);
const waitIdle = async () => {
  while (scheduler.running > 0) await new Promise((resolve) => setTimeout(resolve, 300));
};
const show = (label, rows) => console.log(`\n${label}\n${rows.map((r) => `  ${r.kind} ${r.status} ${new Date(r.run_at).toISOString()} ${JSON.stringify(r.payload)}`).join('\n') || '  —'}`);

try {
  // Боевой чат (не песочница) и песочница с созревшим заданием — поллер должен взять только первый.
  await states.setMode(CHAT, ACCOUNT, 'auto');
  await states.setMode(SANDBOX_CHAT, ACCOUNT, 'auto');
  await db.query(`UPDATE bot_chat_state SET sandbox = true WHERE chat_id = $1`, [SANDBOX_CHAT]);
  await jobs.createMany(SANDBOX_CHAT, [{ kind: 'offer', runAt: new Date(Date.now() - 60_000) }]);

  // Клиент написал, ответа не было (например, сбой) — задание reply.
  history.push({ id: nextId++, direction: 'in', text: 'Здравствуйте! Хочу бесплатный расклад, код 12', mediaKind: null, sentAt: new Date(), readAt: null });
  await jobs.createMany(CHAT, [{ kind: 'reply', runAt: new Date(Date.now() - 1000) }]);

  console.log('запущено заданий:', await scheduler.tick());
  await waitIdle();
  console.log('\nагент ответил:');
  for (const m of history.filter((m) => m.direction === 'out')) console.log('  →', m.text.slice(0, 140).replace(/\n/g, ' '));
  show('задания боевого чата после хода (ждём «непрочитанное» через 24 ч):', await pendingJobs(CHAT));
  show('задания песочницы (поллер не трогает):', await pendingJobs(SANDBOX_CHAT));

  // Клиент прочитал — лестница пересчитывается: напоминание о данных через 60–90 мин.
  for (const m of history) if (m.direction === 'out') m.readAt = new Date();
  const step = await ladder.reschedule(CHAT, channel);
  console.log('\nпосле прочтения:', step?.kind, step?.runAt.toISOString(), step?.reason);
  const again = await ladder.reschedule(CHAT, channel);
  console.log('повторный пересчёт — то же время:', again?.runAt.getTime() === step?.runAt.getTime());
  show('задания:', await pendingJobs(CHAT));

  // Ступень созрела, но канал падает — повтор через минуту, а не передача менеджеру.
  await db.query(`UPDATE bot_jobs SET run_at = now() - interval '1 minute' WHERE chat_id = $1 AND status = 'pending'`, [CHAT]);
  failSends = true;
  console.log('\nзапущено заданий:', await scheduler.tick());
  await waitIdle();
  show('после сбоя (ждём reply или ту же ступень с retry attempt 1):', await pendingJobs(CHAT));
  const state = await states.find(CHAT);
  console.log('режим чата после сбоя:', state.mode, state.handoffReason);
} finally {
  await db.query(`DELETE FROM bot_chat_state WHERE chat_id = ANY($1::uuid[])`, [[CHAT, SANDBOX_CHAT]]);
  await app.close();
}
