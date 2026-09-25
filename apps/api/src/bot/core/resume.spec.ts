import { describe, expect, it } from 'vitest';
import { RealClock, TurnInterrupted, VirtualClock } from './channel.js';
import type { Channel, Clock } from './channel.js';
import { deliver } from './delivery.js';
import { resumePoint } from './resume.js';
import type { DeliveryRecord } from './resume.js';
import type { HistoryMessage, SentPart } from './types.js';

const at = (sec: number) => new Date(sec * 1000);

const record = (patch: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  parts: [
    { text: 'Спасибо, что написали', block: false },
    { text: 'Тело диагностики', block: true },
    { text: 'Что откликнулось?', block: false },
  ],
  delays: {
    initialMs: 60_000,
    parts: [
      { typingMs: 3_000, pauseMs: 0 },
      { typingMs: 5_000, pauseMs: 2_000 },
      { typingMs: 2_000, pauseMs: 2_000 },
    ],
  },
  firstPartAt: at(160).toISOString(),
  baselineMessageId: 10,
  writerArguments: [],
  fallback: false,
  stage: 'diagnostic',
  markRead: true,
  sending: null,
  ...patch,
});

const message = (
  id: number,
  direction: 'in' | 'out',
  text = `m${id}`,
): HistoryMessage => ({
  id,
  direction,
  text,
  mediaKind: null,
  sentAt: at(id),
  readAt: null,
});

const sentPart = (messageId: number, text: string): SentPart => ({
  text,
  block: false,
  messageId,
  delayMs: 0,
  typingMs: 0,
  sentAt: at(messageId),
});

describe('досылка прерванного хода', () => {
  it('ничего не ушло — ждём только остаток исходной паузы', () => {
    const point = resumePoint({
      delivery: record(),
      sent: [],
      history: [message(9, 'out'), message(10, 'in')],
      now: at(130),
    });
    expect(point.movedOn).toBe(false);
    expect(point.sent).toEqual([]);
    expect(point.delays.initialMs).toBe(30_000);
  });

  it('пауза уже прошла — первая часть уходит сразу', () => {
    const point = resumePoint({
      delivery: record(),
      sent: [],
      history: [message(10, 'in')],
      now: at(500),
    });
    expect(point.delays.initialMs).toBe(0);
  });

  it('свои ушедшие части разговор вперёд не двигают', () => {
    const point = resumePoint({
      delivery: record(),
      sent: [sentPart(11, 'Спасибо, что написали')],
      history: [message(10, 'in'), message(11, 'out', 'Спасибо, что написали')],
      now: at(200),
    });
    expect(point.movedOn).toBe(false);
    expect(point.sent).toHaveLength(1);
    expect(point.delays.initialMs).toBe(0);
  });

  it('часть, которая дошла до Telegram, но не записалась, повторно не уходит', () => {
    const point = resumePoint({
      delivery: record({ sending: 1 }),
      sent: [sentPart(11, 'Спасибо, что написали')],
      history: [
        message(10, 'in'),
        message(11, 'out', 'Спасибо, что написали'),
        message(12, 'out', 'Тело диагностики\n'),
      ],
      now: at(200),
    });
    expect(point.movedOn).toBe(false);
    expect(point.sent.map((part) => part.messageId)).toEqual([11, 12]);
    expect(point.sent[1]?.block).toBe(true);
  });

  it('часть уходила, но в истории её нет — уйдёт снова', () => {
    const point = resumePoint({
      delivery: record({ sending: 1 }),
      sent: [sentPart(11, 'Спасибо, что написали')],
      history: [message(10, 'in'), message(11, 'out', 'Спасибо, что написали')],
      now: at(200),
    });
    expect(point.sent).toHaveLength(1);
    expect(point.movedOn).toBe(false);
  });

  it('клиент дописал после хода — досылать поздно', () => {
    const point = resumePoint({
      delivery: record(),
      sent: [],
      history: [message(10, 'in'), message(13, 'in')],
      now: at(200),
    });
    expect(point.movedOn).toBe(true);
  });

  it('менеджер написал после хода — досылать поздно', () => {
    const point = resumePoint({
      delivery: record({ sending: 0 }),
      sent: [],
      history: [
        message(10, 'in'),
        message(12, 'out', 'Здравствуйте, это Анна'),
      ],
      now: at(200),
    });
    expect(point.sent).toEqual([]);
    expect(point.movedOn).toBe(true);
  });
});

describe('доставка с продолжением и остановкой', () => {
  const recorder = () => {
    const log: string[] = [];
    let id = 100;
    const channel: Channel = {
      send: async (_chat, text) => {
        log.push(`send ${text}`);
        id += 1;
        return { messageId: id };
      },
      setTyping: async (_chat, on) => {
        log.push(`typing ${on}`);
      },
      markRead: async () => {
        log.push('read');
      },
      history: async () => [],
    };
    return { log, channel };
  };

  it('продолжает со следующей части: без паузы перед ответом и без «прочитано»', async () => {
    const { log, channel } = recorder();
    const clock = new VirtualClock(at(0));
    const progress: number[] = [];
    const result = await deliver(
      {
        chatId: 'c',
        parts: record().parts,
        delays: record().delays,
        markRead: true,
        isStale: () => false,
        sent: [sentPart(11, 'Спасибо, что написали')],
        onSent: async (sent) => {
          progress.push(sent.length);
        },
      },
      channel,
      clock,
    );
    expect(result.aborted).toBe(false);
    expect(result.sent.map((part) => part.messageId)).toEqual([11, 101, 102]);
    expect(progress).toEqual([2, 3]);
    expect(log).toEqual([
      'typing true',
      'send Тело диагностики',
      'typing true',
      'send Что откликнулось?',
    ]);
    // 2 с паузы + 5 с «печатает» + 2 с паузы + 2 с «печатает»
    expect(clock.now().getTime()).toBe(11_000);
  });

  it('всё уже ушло — ничего не отправляет', async () => {
    const { log, channel } = recorder();
    const parts = record().parts.slice(0, 1);
    const result = await deliver(
      {
        chatId: 'c',
        parts,
        delays: record().delays,
        markRead: true,
        isStale: () => false,
        sent: [sentPart(11, 'Спасибо, что написали')],
      },
      channel,
      new VirtualClock(at(0)),
    );
    expect(result).toEqual({
      sent: [sentPart(11, 'Спасибо, что написали')],
      aborted: false,
    });
    expect(log).toEqual([]);
  });

  it('остановка API прерывает паузу, записав ушедшее', async () => {
    const { log, channel } = recorder();
    const controller = new AbortController();
    const sending: number[] = [];
    let sentCount = 0;
    const clock: Clock = {
      now: () => at(0),
      sleep: async (ms, signal) => {
        // Остановка приходит, пока идёт «печатает» второй части.
        if (ms === 5_000) controller.abort();
        if (signal?.aborted) throw new TurnInterrupted();
      },
    };
    await expect(
      deliver(
        {
          chatId: 'c',
          parts: record().parts,
          delays: record().delays,
          markRead: false,
          isStale: () => false,
          signal: controller.signal,
          onSending: async (index) => {
            sending.push(index);
          },
          onSent: async (sent) => {
            sentCount = sent.length;
          },
        },
        channel,
        clock,
      ),
    ).rejects.toBeInstanceOf(TurnInterrupted);
    expect(sending).toEqual([0]);
    expect(sentCount).toBe(1);
    expect(log).toEqual([
      'typing true',
      'send Спасибо, что написали',
      'typing true',
    ]);
  });

  it('настоящие часы: остановка обрывает долгую паузу сразу', async () => {
    const controller = new AbortController();
    const clock = new RealClock();
    const started = Date.now();
    const pause = clock.sleep(60_000, controller.signal);
    controller.abort();
    await expect(pause).rejects.toBeInstanceOf(TurnInterrupted);
    expect(Date.now() - started).toBeLessThan(1_000);
    await expect(clock.sleep(10, controller.signal)).rejects.toBeInstanceOf(
      TurnInterrupted,
    );
  });
});
