import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMINGS } from '../library/timings.js';
import { TurnCollector } from './turn-collector.js';

const start = new Date('2026-09-30T10:00:00Z').getTime();
const at = (sec: number) => new Date(start + sec * 1000);
const message = (id: number, sec: number) => ({
  id,
  text: `сообщение ${id}`,
  mediaKind: null,
  sentAt: at(sec),
});
const options = { quietMs: 120_000, maxMs: 600_000 };

describe('сборка хода клиента', () => {
  it('по умолчанию ждёт не меньше двух минут', () => {
    expect(DEFAULT_TIMINGS.quietWindowSec.min).toBeGreaterThanOrEqual(120);
    expect(DEFAULT_TIMINGS.quietMaxSec).toBeGreaterThan(
      DEFAULT_TIMINGS.quietWindowSec.max,
    );
  });

  it('несколько сообщений подряд — один ход, окно от последнего', () => {
    const collector = new TurnCollector();
    collector.push('chat', message(1, 0), at(0), options);
    collector.push('chat', message(2, 3), at(3), options);
    collector.push('chat', message(3, 7), at(7), options);

    expect(collector.due(at(120))).toEqual([]);
    expect(collector.due(at(126))).toEqual([]);
    expect(collector.due(at(127))).toEqual(['chat']);
    expect(collector.take('chat')?.messages.map((m) => m.id)).toEqual([
      1, 2, 3,
    ]);
  });

  it('«печатает» в конце окна продлевает его', () => {
    const collector = new TurnCollector();
    collector.push('chat', message(1, 0), at(0), options);
    collector.typing('chat', at(115), 15_000);

    expect(collector.due(at(129))).toEqual([]);
    expect(collector.due(at(130))).toEqual(['chat']);
  });

  it('без конца пишущий клиент получает ответ не позже потолка', () => {
    const collector = new TurnCollector();
    for (let sec = 0; sec <= 540; sec += 60) {
      collector.push('chat', message(sec, sec), at(sec), options);
    }
    expect(collector.due(at(599))).toEqual([]);
    expect(collector.due(at(600))).toEqual(['chat']);
  });

  it('новое сообщение делает идущий ход устаревшим', () => {
    const collector = new TurnCollector();
    collector.push('chat', message(1, 0), at(0), options);
    const taken = collector.take('chat');
    collector.push('chat', message(2, 150), at(150), options);
    expect(collector.isStale('chat', taken?.generationSeq ?? 0)).toBe(true);
  });
});
