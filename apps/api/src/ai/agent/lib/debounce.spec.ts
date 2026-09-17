import { describe, expect, it } from 'vitest';
import { inboundRunAt, typingRunAt } from './debounce.js';

const T0 = new Date('2026-09-17T12:00:00Z');
const sec = (n: number) => new Date(T0.getTime() + n * 1000);

describe('inboundRunAt', () => {
  it('ждёт тишины debounceSec после последнего сообщения', () => {
    expect(inboundRunAt({ now: T0, batchStartedAt: T0, debounceSec: 120, maxSec: 300 })).toEqual(sec(120));
    expect(inboundRunAt({ now: sec(60), batchStartedAt: T0, debounceSec: 120, maxSec: 300 })).toEqual(sec(180));
  });

  it('не выходит за потолок от первого сообщения пачки', () => {
    expect(inboundRunAt({ now: sec(250), batchStartedAt: T0, debounceSec: 120, maxSec: 300 })).toEqual(sec(300));
    expect(inboundRunAt({ now: sec(400), batchStartedAt: T0, debounceSec: 120, maxSec: 300 })).toEqual(sec(400));
  });
});

describe('typingRunAt', () => {
  it('продлевает на 30 с, если запуск ближе, и не трогает, если дальше', () => {
    expect(typingRunAt({ now: sec(100), currentRunAt: sec(110), batchStartedAt: T0, maxSec: 300 })).toEqual(sec(130));
    expect(typingRunAt({ now: sec(100), currentRunAt: sec(180), batchStartedAt: T0, maxSec: 300 })).toBeNull();
  });

  it('уважает потолок', () => {
    expect(typingRunAt({ now: sec(290), currentRunAt: sec(295), batchStartedAt: T0, maxSec: 300 })).toEqual(sec(300));
    expect(typingRunAt({ now: sec(299), currentRunAt: sec(300), batchStartedAt: T0, maxSec: 300 })).toBeNull();
  });
});
