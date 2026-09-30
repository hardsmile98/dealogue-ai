// Прогон сценариев владельца: реальная база и DeepSeek, канал в памяти, без Telegram.
// Печатает, что ушло клиенту, и замечания проверяющего — проверка «ничего лишнего».
// Запуск из apps/api после nest build: TELEGRAM_API_ID= TELEGRAM_API_HASH= BOT_ACCOUNT_ID=<uuid> node scripts/run-scenarios.mjs [A|B|…|O]
// G–O ждут в библиотеке аккаунта вопросы знакомства agent.* (импорт стандартной библиотеки, режим keep).
// KEEP=1 оставляет чаты песочницы для разбора (потом: DELETE FROM bot_chat_state WHERE sandbox AND ...).
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../dist/app.module.js';
import { TurnRunnerService } from '../dist/bot/services/turn-runner.service.js';
import { BotRecoveryService } from '../dist/bot/services/bot-recovery.service.js';
import { BotLadderService } from '../dist/bot/services/bot-ladder.service.js';
import { BotChatStateRepository } from '../dist/bot/repositories/bot-chat-state.repository.js';
import { BotJobsRepository } from '../dist/bot/repositories/bot-jobs.repository.js';

const ACCOUNT = process.env.BOT_ACCOUNT_ID ?? '';
if (!ACCOUNT) {
  console.error('Укажите BOT_ACCOUNT_ID=<uuid аккаунта>');
  process.exit(1);
}
const ONLY = process.argv[2] ?? null;

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
// Без HTTP-сервера восстановление ждало бы `listen` вечно; ходы скрипта ему не нужны.
app.get(BotRecoveryService).ready = async () => {};
const runner = app.get(TurnRunnerService);
const states = app.get(BotChatStateRepository);
const jobs = app.get(BotJobsRepository);
const ladder = app.get(BotLadderService);
const db = app.get(DataSource);

/** `clientName` — имя клиента в профиле Telegram (подсказка анализатору для пола). */
function session(name, { clientName = null } = {}) {
  const CHAT = randomUUID();
  const history = [];
  let nextId = 1;
  let minute = 0;
  let seq = 0;
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
    clientName: async () => clientName,
  };
  const log = [];
  const print = (line) => {
    log.push(line);
  };
  const show = (text) =>
    text.length > 220
      ? `${text.slice(0, 220).replace(/\n/g, ' ')}… [${text.length} симв.]`
      : text.replace(/\n/g, ' / ');

  async function turnLog(turnId) {
    const [row] = await db.query(
      `SELECT plan->>'goal' AS goal, plan->>'nudge' AS nudge, plan->'milestone'->>'title' AS milestone, review, final->'removed' AS removed, error FROM bot_turns WHERE id = $1`,
      [turnId],
    );
    if (!row) return;
    if (row.nudge || row.milestone)
      print(
        `      план: ${[row.nudge && `шаг ${row.nudge}`, row.milestone && `веха «${row.milestone}»`].filter(Boolean).join(', ')}`,
      );
    if (row.review?.violations?.length)
      print(
        `      проверяющий: ${row.review.violations.map((v) => `${v.code}(${v.severity}): ${v.detail}`).join(' | ')}${row.review.rewritten ? ' → переписано' : ''}`,
      );
    if (row.removed?.length)
      print(`      вырезано: ${JSON.stringify(row.removed)}`);
    if (row.error) print(`      ошибка: ${row.error}`);
  }
  /** Какую ступень лестница поставила после хода или прочтения. */
  async function ladderLog() {
    const [job] = await db.query(
      `SELECT kind, run_at FROM bot_jobs WHERE chat_id = $1 AND status = 'pending' ORDER BY run_at LIMIT 1`,
      [CHAT],
    );
    const inMin = job
      ? Math.round(
          (new Date(job.run_at).getTime() - clock.now().getTime()) / 60_000,
        )
      : null;
    print(
      `      лестница: ${job ? `${job.kind} через ${inMin} мин` : 'ничего'}`,
    );
  }
  async function report(label, result) {
    print(`  ${label}`);
    print(
      `    [${result.status}, этап ${result.stage}${result.handoff ? ', менеджер: ' + result.handoff : ''}]`,
    );
    for (const part of result.sent)
      print(`    АГЕНТ${part.block ? ' (веха)' : ''}: ${show(part.text)}`);
    await turnLog(result.turnId);
    await ladderLog();
  }
  return {
    CHAT,
    log,
    wait: (m) => {
      minute += m;
    },
    /** «Клиент прочитал»: отметки и пересчёт лестницы, как по событию из Telegram. */
    async readAll() {
      history.forEach((m) => {
        if (m.direction === 'out' && !m.readAt) m.readAt = clock.now();
      });
      await ladder.reschedule(CHAT, channel);
      print('  (клиент прочитал)');
      await ladderLog();
    },
    async start() {
      await states.setMode(CHAT, ACCOUNT, 'auto');
      await db.query(
        `UPDATE bot_chat_state SET sandbox = true WHERE chat_id = $1`,
        [CHAT],
      );
      print(`\n##### Сценарий ${name}`);
    },
    async client(texts) {
      const messages = texts.map((text) => {
        const id = nextId++;
        const message = { id, text, mediaKind: null, sentAt: clock.now() };
        history.push({ ...message, direction: 'in', readAt: null });
        return message;
      });
      seq += 1;
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
      await report(`КЛИЕНТ: ${texts.join(' | ')}`, result);
    },
    async schedule(kind) {
      await jobs.createMany(CHAT, [{ kind, runAt: clock.now() }]);
      const [job] = await db.query(
        `SELECT id FROM bot_jobs WHERE chat_id = $1 AND kind = $2 AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
        [CHAT, kind],
      );
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
      await report(`ПО РАСПИСАНИЮ: ${kind}`, result);
    },
    async finish() {
      const calls = await db.query(
        `SELECT kind, count(*)::int AS n FROM bot_prompt_snapshots WHERE turn_id IN (SELECT id FROM bot_turns WHERE chat_id = $1) GROUP BY kind ORDER BY kind`,
        [CHAT],
      );
      print(
        `  обращений к модели: ${calls.map((c) => `${c.kind} ${c.n}`).join(', ')}`,
      );
      if (process.env.KEEP !== '1')
        await db.query(`DELETE FROM bot_chat_state WHERE chat_id = $1`, [CHAT]);
      console.log(log.join('\n'));
    },
  };
}

const scenarios = {
  // Диалог владельца со скриншотов: данные без сферы, запрос — уже в ожидании.
  async A() {
    const s = session('A: диалог со скриншотов');
    await s.start();
    await s.client(['Здравствуйте! Хочу бесплатный расклад, код 12']);
    s.wait(3);
    await s.client(['06.06.1999', 'Москва']);
    s.wait(2);
    await s.client([
      'Стал мало зарабатывать денег',
      'Очень плохо себя чувствую от этого',
    ]);
    s.wait(60);
    await s.schedule('diagnostic');
    s.wait(20);
    await s.client(['Да, расскажите']);
    s.wait(10);
    await s.client(['Сколько стоит?']);
    await s.finish();
  },
  // Вопросы вне сценария, «ок» во время ожидания.
  async B() {
    const s = session('B: вопросы вне сценария');
    await s.start();
    await s.client([
      'Здравствуйте Марсель! Хочу получить бесплатный расклад от Вас! код: 12',
    ]);
    s.wait(3);
    await s.client([
      '04.01.1999, Москва',
      'финансы. муж ушёл три месяца назад, с деньгами совсем тяжело стало',
      'а вы сами где живёте?',
    ]);
    s.wait(5);
    await s.client([
      'а сколько стоит работа с вами?',
      'и сколько ждать расклад?',
    ]);
    s.wait(2);
    await s.client(['ok 👍']);
    s.wait(60);
    await s.schedule('diagnostic');
    s.wait(20);
    await s.client([
      'Прочитала. Многое откликается, особенно про блоки на деньги. Что с этим делать?',
    ]);
    s.wait(10);
    await s.client(['Понятно. А сколько это стоит?']);
    await s.finish();
  },
  // Клиент молчит: напоминание о данных → общая диагностика → напоминания до лимита.
  async C() {
    const s = session('C: клиент молчит');
    await s.start();
    await s.client(['Добрый день, код 7']);
    await s.readAll();
    s.wait(90);
    await s.schedule('birth_data_reminder');
    await s.readAll();
    s.wait(75);
    await s.schedule('diagnostic');
    await s.readAll();
    s.wait(75);
    await s.schedule('return_question');
    await s.readAll();
    s.wait(16 * 60);
    await s.schedule('return_question');
    await s.readAll();
    await s.finish();
  },
  // Сомнение после диагностики, возражение, выбор варианта.
  async D() {
    const s = session('D: сомнение, возражение, выбор');
    await s.start();
    await s.client(['Здравствуйте, хочу расклад на отношения, код 3']);
    s.wait(3);
    await s.client([
      '12.03.1990, Казань. Муж ушёл месяц назад, не могу прийти в себя',
    ]);
    s.wait(60);
    await s.schedule('diagnostic');
    s.wait(15);
    await s.client(['А это правда работает?']);
    s.wait(10);
    await s.client(['Да, расскажите']);
    s.wait(10);
    await s.client(['Я подумаю']);
    s.wait(10);
    await s.client(['Давайте первый вариант']);
    await s.finish();
  },
  // Второй диалог владельца из песочницы: отвечает, не нажимая «прочитано».
  async E() {
    const s = session('E: песочница владельца, «Финансы»');
    await s.start();
    await s.client(['Здравствуйте, код 12']);
    s.wait(3);
    await s.client(['01.02.1999', 'Финансы']);
    s.wait(1);
    await s.client(['Москва']);
    s.wait(1);
    await s.client(['Класс']);
    s.wait(60);
    await s.schedule('diagnostic');
    s.wait(1);
    await s.client(['Расскажите']);
    s.wait(1);
    await s.client(['Все']);
    await s.finish();
  },
  // Первый диалог владельца из песочницы.
  async F() {
    const s = session('F: песочница владельца, «всё плохо»');
    await s.start();
    await s.client(['Здравствуйте! Хочу бесплатный расклад, код 12']);
    s.wait(3);
    await s.client(['04.04.1999', 'Москва']);
    s.wait(1);
    await s.client(['Не знаю, просто все плохо']);
    s.wait(1);
    await s.client(['Отлично']);
    s.wait(60);
    await s.schedule('diagnostic');
    s.wait(1);
    await s.client(['Да есть желение']);
    s.wait(1);
    await s.client(['Все подходят']);
    await s.finish();
  },
  // Сфера «отношения» без подкатегории: уточняющий вопрос, диагностика по
  // ответу; пол — по имени из профиля.
  async G() {
    const s = session('G: отношения — уточнение', { clientName: 'Анна' });
    await s.start();
    await s.client(['Здравствуйте, хочу бесплатный расклад, код 12']);
    s.wait(3);
    await s.client(['04.01.1999, Москва, отношения']);
    s.wait(2);
    await s.client(['Нет, расстались полгода назад']);
    s.wait(60);
    await s.schedule('diagnostic');
    await s.finish();
  },
  // Данные без сферы, клиент молчит: вопрос о сфере → напоминание → общая диагностика.
  async H() {
    const s = session('H: без сферы и молчит');
    await s.start();
    await s.client(['Добрый день, код 5']);
    s.wait(3);
    await s.client(['12.12.1990 Сочи']);
    await s.readAll();
    s.wait(90);
    await s.schedule('birth_data_reminder');
    await s.readAll();
    s.wait(75);
    await s.schedule('diagnostic');
    await s.finish();
  },
  // Сфера в первом сообщении без данных: уточнение в просьбе о данных.
  async I() {
    const s = session('I: семья — уточнение в просьбе о данных', {
      clientName: 'Ольга Петрова',
    });
    await s.start();
    await s.client(['Здравствуйте! Хочу расклад по семье, код 12']);
    s.wait(3);
    await s.client(['03.03.1985, Самара', 'да, двое детей']);
    s.wait(60);
    await s.schedule('diagnostic');
    await s.finish();
  },
  // Мужское имя в профиле: «да» на уточнение — «Отношения в паре», мужская.
  async J() {
    const s = session('J: отношения, мужское имя в профиле', {
      clientName: 'Дмитрий',
    });
    await s.start();
    await s.client(['Здравствуйте, код 12']);
    s.wait(3);
    await s.client(['15.08.1988, Тверь, отношения']);
    s.wait(2);
    await s.client(['Да']);
    s.wait(60);
    await s.schedule('diagnostic');
    await s.finish();
  },
  // Ник вместо имени — не признак пола: без него — универсальная.
  async K() {
    const s = session('K: ник в профиле', { clientName: 'Солнышко 🌸' });
    await s.start();
    await s.client(['Здравствуйте, код 12']);
    s.wait(3);
    await s.client(['15.08.1988, Тверь, отношения']);
    s.wait(2);
    await s.client(['Нет']);
    s.wait(60);
    await s.schedule('diagnostic');
    await s.finish();
  },
  // Песочница владельца 30.09: на просьбу о данных — только «Отношения».
  // Дату просим ещё раз вместе с уточнением, потом ещё раз; место — нет.
  async L() {
    const s = session('L: «Отношения» без даты', { clientName: 'Анна' });
    await s.start();
    await s.client(['Здравствуйте! Хочу бесплатный расклад, код 12']);
    s.wait(2);
    await s.client(['Отношения']);
    s.wait(2);
    await s.client(['Нет']);
    s.wait(2);
    await s.client(['04.04.1999']);
    s.wait(60);
    await s.schedule('diagnostic');
    await s.finish();
  },
  // «Отношения» и молчит: напоминание о дате → диагностика по сфере.
  async M() {
    const s = session('M: «Отношения» и молчит', { clientName: 'Анна' });
    await s.start();
    await s.client(['Здравствуйте! Хочу бесплатный расклад, код 12']);
    s.wait(2);
    await s.client(['Отношения']);
    await s.readAll();
    s.wait(90);
    await s.schedule('birth_data_reminder');
    await s.readAll();
    s.wait(75);
    await s.schedule('diagnostic');
    await s.finish();
  },
  // Песочница владельца 30.09 без имени в профиле: пол — по «с мужем».
  async N() {
    const s = session('N: пол по словам о муже');
    await s.start();
    await s.client(['Здравствуйте! Хочу бесплатный расклад, код 12']);
    s.wait(2);
    await s.client(['04.04.1999 Москва']);
    s.wait(2);
    await s.client(['Отношения']);
    s.wait(2);
    await s.client(['Да, в отношениях с мужем 10 лет']);
    s.wait(60);
    await s.schedule('diagnostic');
    await s.finish();
  },
  // Не помнит дату — больше не просим.
  async O() {
    const s = session('O: не помнит дату', { clientName: 'Ольга' });
    await s.start();
    await s.client(['Здравствуйте, код 12']);
    s.wait(2);
    await s.client(['Финансы', 'дату рождения точно не помню']);
    s.wait(60);
    await s.schedule('diagnostic');
    await s.finish();
  },
};

try {
  for (const [key, run] of Object.entries(scenarios)) {
    if (ONLY && ONLY !== key) continue;
    await run();
  }
} finally {
  await app.close();
}
