import { describe, expect, it } from 'vitest';
import { buildExchanges, qualityOf } from './exchange-builder.js';
import type { ExchangeSourceMessage } from './exchange-builder.js';

function msg(id: number, direction: 'in' | 'out', text: string, minute: number, aiRunId: string | null = null): ExchangeSourceMessage {
  return { telegramMessageId: id, direction, text, sentAt: new Date(Date.UTC(2026, 0, 1, 10, minute)), aiRunId };
}

describe('buildExchanges', () => {
  it('склеивает блоки клиента и менеджера, считает задержку от последнего сообщения клиента', () => {
    const result = buildExchanges([
      msg(1, 'in', 'Здравствуйте', 0),
      msg(2, 'in', 'Сколько стоит курс?', 1),
      msg(3, 'out', 'Добрый день!', 5),
      msg(4, 'out', 'Курс стоит 30 000, есть рассрочка', 6),
      msg(5, 'in', 'Спасибо, подумаю', 20),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].clientMessageId).toBe(1);
    expect(result[0].clientText).toBe('Здравствуйте\nСколько стоит курс?');
    expect(result[0].managerText).toBe('Добрый день!\nКурс стоит 30 000, есть рассрочка');
    expect(result[0].managerParts).toBe(2);
    expect(result[0].delaySec).toBe(4 * 60);
  });

  it('пропускает блоки, где ответил ИИ', () => {
    const result = buildExchanges([
      msg(1, 'in', 'Вопрос', 0),
      msg(2, 'out', 'Ответ ИИ', 1, 'run-1'),
      msg(3, 'in', 'Ещё вопрос', 2),
      msg(4, 'out', 'Ответ человека, довольно подробный', 3),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].clientMessageId).toBe(3);
  });

  it('исходящее без входящего перед ним не образует обмен', () => {
    const result = buildExchanges([msg(1, 'out', 'Привет, это менеджер', 0), msg(2, 'in', 'Привет', 1)]);
    expect(result).toHaveLength(0);
  });
});

describe('qualityOf', () => {
  it('медиа-заглушки и односложные ответы — мусор', () => {
    expect(qualityOf('[Фото]', 'ок', 10)).toBe(0);
    expect(qualityOf('привет', 'да', 10)).toBe(0);
  });
  it('ответ через сутки — не ответ', () => {
    expect(qualityOf('Сколько стоит курс?', 'Курс стоит 30 000, есть рассрочка', 25 * 3600)).toBe(0);
  });
  it('содержательная пара — показательная', () => {
    expect(qualityOf('Сколько стоит курс и есть ли рассрочка?', 'Курс стоит 30 000 рублей, рассрочка на 6 месяцев без переплаты', 120)).toBe(2);
  });
});
