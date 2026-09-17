import { describe, expect, it } from 'vitest';
import { TELEGRAM_MESSAGE_LIMIT, splitIntoMessages } from './split-messages.js';

const paragraph = (n: number, char = 'а') => `${char.repeat(n)}.`;

describe('splitIntoMessages', () => {
  it('короткий текст — одно сообщение', () => {
    expect(splitIntoMessages('Привет!\n\nКак дела?')).toEqual(['Привет!\n\nКак дела?']);
  });

  it('пустой текст — ничего', () => {
    expect(splitIntoMessages('   \n\n ')).toEqual([]);
  });

  it('режет по разделителю ---', () => {
    const text = 'Первое\n\n---\n\nВторое\n---\nТретье';
    expect(splitIntoMessages(text)).toEqual(['Первое', 'Второе', 'Третье']);
  });

  it('группирует абзацы до мягкого лимита, не разрывая абзац', () => {
    const parts = [paragraph(700), paragraph(700), paragraph(700), paragraph(700)];
    const text = parts.join('\n\n');
    const result = splitIntoMessages(text, { softLimit: 1500, hardLimit: 1500 });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(`${parts[0]}\n\n${parts[1]}`);
    expect(result[1]).toBe(`${parts[2]}\n\n${parts[3]}`);
  });

  it('абзац длиннее жёсткого лимита режется по предложениям', () => {
    const sentences = Array.from({ length: 10 }, (_, i) => `Предложение номер ${i} ${'x'.repeat(300)}.`);
    const text = sentences.join(' ');
    const result = splitIntoMessages(text, { softLimit: 1000, hardLimit: 1000 });
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) expect(chunk.length).toBeLessThanOrEqual(1000);
    expect(result.join(' ')).toBe(text);
  });

  it('никогда не превышает лимит Telegram', () => {
    const text = 'y'.repeat(TELEGRAM_MESSAGE_LIMIT * 2 + 10);
    const result = splitIntoMessages(text);
    for (const chunk of result) expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    expect(result.join('')).toBe(text);
  });

  it('нормализует переводы строк и лишние пустые строки', () => {
    expect(splitIntoMessages('a\r\n\r\n\r\n\r\nb')).toEqual(['a\n\nb']);
  });
});
