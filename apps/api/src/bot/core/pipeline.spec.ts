import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../library/timings.js';
import type { Channel, Clock } from './channel.js';
import { deliver, planDelays } from './delivery.js';
import {
  containsMoney,
  extractUrls,
  hardChecks,
  splitLong,
  wrongScript,
} from './hard-checks.js';
import { TurnCollector } from './turn-collector.js';
import { WriterParseError, parseWriterOutput } from './writer-output.js';

describe('разбор ответа писателя', () => {
  it('сообщения, продолжение после вехи и мета — из JSON', () => {
    const draft = parseWriterOutput(`{
      "messages": ["Понимаю вас 🙏", "Смотрите, чистка как раз с этим работает.\\n\\nСкажите, что бы вы хотели изменить?", "  ", 5],
      "after_block": ["Откликается?"],
      "nudge": "ask_goal", "arguments": ["expensive:0"], "unanswered_about": ["сколько лет практикует"], "notes": "ответил"
    }`);
    expect(draft.parts).toEqual([
      'Понимаю вас 🙏',
      'Смотрите, чистка как раз с этим работает.\n\nСкажите, что бы вы хотели изменить?',
    ]);
    expect(draft.after).toEqual(['Откликается?']);
    expect(draft.meta).toEqual({
      nudge: 'ask_goal',
      arguments: ['expensive:0'],
      unansweredAbout: ['сколько лет практикует'],
      notes: 'ответил',
    });
  });

  it('ограждения ```json допустимы, не-JSON — ошибка разбора (ход запросит ответ ещё раз)', () => {
    expect(
      parseWriterOutput('```json\n{"messages": ["Текст"]}\n```').parts,
    ).toEqual(['Текст']);
    expect(parseWriterOutput('{}')).toEqual({
      parts: [],
      after: [],
      meta: { nudge: null, arguments: [], unansweredAbout: [], notes: '' },
    });
    expect(() => parseWriterOutput('Просто текст')).toThrow(WriterParseError);
    expect(() => parseWriterOutput('["a"]')).toThrow(WriterParseError);
  });
});

describe('жёсткие проверки', () => {
  const allowedUrls = new Set(['instagram.com/soul', 't.me/soul']);
  const base = {
    after: [],
    block: null,
    allowedUrls,
    language: 'ru',
    maxParts: 3,
  };

  it('суммы с валютой видны в любой записи, числа без валюты — нет', () => {
    for (const text of [
      'Пакет — 250€',
      'второй 1 200 евро',
      'третий 99 $',
      '€250',
      '5000 руб.',
      '5000 рублей',
      '300 грн',
      '50 USD',
    ]) {
      expect(containsMoney(text), text).toBe(true);
    }
    for (const text of [
      'Мне 35 лет',
      'за 2-3 недели',
      'в 2 раза',
      '3 европейских города',
      'код 12',
    ]) {
      expect(containsMoney(text), text).toBe(false);
    }
  });

  it('адреса в нормальной форме', () => {
    expect(
      extractUrls(
        'Мой инстаграм https://www.instagram.com/soul/, и t.me/soul.',
      ),
    ).toEqual(['instagram.com/soul', 't.me/soul']);
  });

  it('вырезает часть с суммой, чужим адресом или разметкой, остальное оставляет', () => {
    const result = hardChecks({
      ...base,
      parts: [
        'Стоит 300€',
        'Загляните на https://instagram.com/soul',
        'Пишите на t.me/other',
        'Вот {{block}}',
      ],
    });
    expect(result.parts.map((part) => part.text)).toEqual([
      'Загляните на https://instagram.com/soul',
    ]);
    expect(result.removed.map((item) => item.reason)).toEqual([
      'сумма в тексте ответчика',
      'адрес не из библиотеки: t.me/other',
      'служебная разметка в тексте',
    ]);
    expect(result.blocked).toBe(false);
  });

  it('отправлять нечего — blocked', () => {
    expect(hardChecks({ ...base, parts: ['Стоит 300€'] }).blocked).toBe(true);
    expect(hardChecks({ ...base, parts: [] }).blocked).toBe(true);
  });

  it('веха встаёт между вступлением и продолжением побайтно; без текста уходит сама', () => {
    const block = 'Я вернулся и закончил анализ 🙏\n\nВижу, что…';
    const framed = hardChecks({
      ...base,
      block,
      parts: ['Как и обещал, вот что увидел:'],
      after: ['Откликается?'],
    });
    expect(framed.parts).toEqual([
      { text: 'Как и обещал, вот что увидел:', block: false },
      { text: block, block: true },
      { text: 'Откликается?', block: false },
    ]);
    const alone = hardChecks({ ...base, block, parts: ['Стоит 300€'] });
    expect(alone.parts).toEqual([{ text: block, block: true }]);
    expect(alone.blocked).toBe(false);
    // Без вехи продолжение просто идёт следом.
    expect(
      hardChecks({ ...base, parts: ['раз'], after: ['два'] }).parts.map(
        (part) => part.text,
      ),
    ).toEqual(['раз', 'два']);
  });

  it('письменность: только явный промах на длинном тексте, адреса не считаются', () => {
    expect(
      wrongScript(
        'This is a long english sentence without russian letters at all',
        'ru',
      ),
    ).toBe(true);
    expect(
      wrongScript(
        'Понимаю вас, это правда тяжело, давайте разберёмся вместе',
        'ru',
      ),
    ).toBe(false);
    expect(wrongScript('ок', 'ru')).toBe(false);
    expect(
      wrongScript(
        'Загляните: https://instagram.com/some_long_practitioner_page_name',
        'ru',
      ),
    ).toBe(false);
    expect(
      wrongScript('Понимаю, это Instagram и Telegram, но давайте о вас', 'ru'),
    ).toBe(false);
    expect(
      wrongScript('Любой текст на языке без проверки письменности', 'other'),
    ).toBe(false);
  });

  it('лимит частей: место под вопрос после вехи сохраняется', () => {
    const result = hardChecks({
      ...base,
      parts: ['раз', 'два', 'три', 'четыре'],
    });
    expect(result.parts).toHaveLength(3);
    expect(result.removed[0]?.reason).toContain('больше 3 частей');
    const block = 'веха';
    const framed = hardChecks({
      ...base,
      block,
      parts: ['раз', 'два', 'три'],
      after: ['откликается?', 'лишнее'],
    });
    expect(framed.parts.map((part) => part.text)).toEqual([
      'раз',
      'два',
      'веха',
      'откликается?',
    ]);
    expect(framed.removed.map((item) => item.part)).toEqual(['три', 'лишнее']);
    const short = hardChecks({
      ...base,
      block,
      parts: ['раз'],
      after: ['после', 'ещё'],
    });
    expect(short.parts.map((part) => part.text)).toEqual([
      'раз',
      'веха',
      'после',
      'ещё',
    ]);
  });

  it('длинная веха режется по абзацам под лимит Telegram', () => {
    const paragraph = 'а'.repeat(1500);
    const chunks = splitLong(
      [paragraph, paragraph, paragraph, paragraph].join('\n\n'),
      4096,
    );
    expect(chunks).toHaveLength(2);
    expect(chunks.every((chunk) => chunk.length <= 4096)).toBe(true);
    expect(splitLong('короткий')).toEqual(['короткий']);
    const huge = splitLong('б'.repeat(9000), 4096);
    expect(huge.length).toBe(3);
  });
});

describe('задержки доставки', () => {
  const now = new Date('2026-09-25T10:00:00Z');
  const fixed = () => 0.5;
  const parts = [
    { text: 'а'.repeat(60), block: false },
    { text: 'веха', block: true },
  ];

  it('новый лид, «в чате», недавно, давно', () => {
    const lead = planDelays({
      trigger: 'client',
      isNewLead: true,
      lastOutgoingAt: null,
      now,
      parts,
      timings: DEFAULT_TIMINGS,
      random: fixed,
    });
    expect(lead.initialMs).toBe(150_000);
    const inChat = planDelays({
      trigger: 'client',
      isNewLead: false,
      lastOutgoingAt: new Date(now.getTime() - 2 * 60_000),
      now,
      parts,
      timings: DEFAULT_TIMINGS,
      random: fixed,
    });
    expect(inChat.initialMs).toBe(25_000);
    const recent = planDelays({
      trigger: 'client',
      isNewLead: false,
      lastOutgoingAt: new Date(now.getTime() - 30 * 60_000),
      now,
      parts,
      timings: DEFAULT_TIMINGS,
      random: fixed,
    });
    expect(recent.initialMs).toBe(150_000);
    const away = planDelays({
      trigger: 'client',
      isNewLead: false,
      lastOutgoingAt: new Date(now.getTime() - 3 * 3_600_000),
      now,
      parts,
      timings: DEFAULT_TIMINGS,
      random: fixed,
    });
    expect(away.initialMs).toBe(450_000);
    const scheduled = planDelays({
      trigger: 'schedule',
      isNewLead: false,
      lastOutgoingAt: null,
      now,
      parts,
      timings: DEFAULT_TIMINGS,
      random: fixed,
    });
    expect(scheduled.initialMs).toBe(0);
  });

  it('«печатает» по длине, веха как вставка, паузы между частями', () => {
    const plan = planDelays({
      trigger: 'schedule',
      isNewLead: false,
      lastOutgoingAt: null,
      now,
      parts,
      timings: DEFAULT_TIMINGS,
      random: fixed,
    });
    expect(plan.parts).toEqual([
      { typingMs: 10_000, pauseMs: 0 },
      { typingMs: 7_500, pauseMs: 6_500 },
    ]);
    const long = planDelays({
      trigger: 'schedule',
      isNewLead: false,
      lastOutgoingAt: null,
      now,
      parts: [{ text: 'x'.repeat(1000), block: false }],
      timings: DEFAULT_TIMINGS,
      random: fixed,
    });
    expect(long.parts[0]?.typingMs).toBe(25_000);
  });

  it('доставка: устаревший ход останавливается между частями', async () => {
    const log: string[] = [];
    let time = 0;
    const clock: Clock = {
      now: () => new Date(time),
      sleep: async (ms) => {
        time += ms;
        log.push(`sleep ${ms}`);
      },
    };
    let sends = 0;
    const channel: Channel = {
      send: async (_chat, text) => {
        sends += 1;
        log.push(`send ${text}`);
        return { messageId: sends };
      },
      setTyping: async (_chat, on) => {
        log.push(`typing ${on}`);
      },
      markRead: async () => {
        log.push('read');
      },
      history: async () => [],
    };
    const delays = {
      initialMs: 100,
      parts: [
        { typingMs: 10, pauseMs: 0 },
        { typingMs: 10, pauseMs: 5 },
      ],
    };
    const result = await deliver(
      {
        chatId: 'c',
        parts: [
          { text: 'один', block: false },
          { text: 'два', block: false },
        ],
        delays,
        markRead: true,
        isStale: () => sends >= 1,
      },
      channel,
      clock,
    );
    expect(result.aborted).toBe(true);
    expect(result.sent.map((part) => part.text)).toEqual(['один']);
    expect(log).toEqual([
      'sleep 100',
      'read',
      'typing true',
      'sleep 10',
      'send один',
      'sleep 5',
    ]);
  });
});

describe('сборщик хода', () => {
  const at = (sec: number) => new Date(sec * 1000);
  const message = (id: number) => ({
    id,
    text: `m${id}`,
    mediaKind: null,
    sentAt: at(0),
  });
  const options = { quietMs: 30_000, maxMs: 180_000 };

  it('копит очередь, пока клиент пишет, и закрывает по тишине', () => {
    const collector = new TurnCollector();
    expect(collector.push('c', message(1), at(0), options)).toBe(1);
    expect(collector.due(at(20))).toEqual([]);
    collector.push('c', message(2), at(20), options);
    expect(collector.due(at(40))).toEqual([]);
    collector.typing('c', at(45), 15_000);
    expect(collector.due(at(55))).toEqual([]);
    expect(collector.due(at(61))).toEqual(['c']);
    const turn = collector.take('c');
    expect(turn?.messages.map((m) => m.id)).toEqual([1, 2]);
    expect(turn?.generationSeq).toBe(2);
    expect(collector.hasPending('c')).toBe(false);
  });

  it('верхняя граница ожидания и устаревание', () => {
    const collector = new TurnCollector();
    for (let i = 0; i < 10; i++)
      collector.push('c', message(i), at(i * 25), options);
    expect(collector.due(at(181))).toEqual(['c']);
    const turn = collector.take('c')!;
    expect(collector.isStale('c', turn.generationSeq)).toBe(false);
    collector.push('c', message(99), at(200), options);
    expect(collector.isStale('c', turn.generationSeq)).toBe(true);
    expect(collector.drain('c').map((m) => m.id)).toEqual([99]);
  });

  it('передача менеджеру: собранное выбрасывается, идущий ход устаревает', () => {
    const collector = new TurnCollector();
    const seq = collector.push('c', message(1), at(0), options);
    collector.invalidate('c');
    expect(collector.hasPending('c')).toBe(false);
    expect(collector.isStale('c', seq)).toBe(true);
  });
});
