/**
 * Решения Telegram-канала агента, которые не зависят от Telegram:
 * брать ли диалог и своё ли исходящее. Сам канал — services/bot-telegram.service.ts.
 */

export interface DialogStart {
  firstMessageDirection: 'in' | 'out' | null;
  firstMessageAt: Date | null;
}

/**
 * Агент сам берёт только новый диалог: начатый клиентом и не раньше, чем
 * агент включён на аккаунте (раздел 3.1). Старые чаты — только руками.
 */
export function isNewLead(chat: DialogStart, enabledAt: Date | null): boolean {
  return (
    chat.firstMessageDirection === 'in' &&
    chat.firstMessageAt !== null &&
    enabledAt !== null &&
    chat.firstMessageAt.getTime() >= enabledAt.getTime()
  );
}

/**
 * Свои исходящие агента. Исходящее, которого здесь нет, написал человек —
 * менеджер из веба или с телефона, и чат уходит ему. Эхо от Telegram может
 * прийти раньше, чем отправка вернула id, поэтому помнится и текст, который
 * отправляется прямо сейчас.
 */
export class OwnOutgoing {
  private readonly ids = new Map<string, number[]>();
  private readonly inFlight = new Map<string, string[]>();

  constructor(private readonly limit = 200) {}

  /** Отправка началась; вызвать возвращённую функцию, когда она закончилась (успешно или нет). */
  sending(chatId: string, text: string): () => void {
    const texts = this.inFlight.get(chatId) ?? [];
    texts.push(text);
    this.inFlight.set(chatId, texts);
    return () => {
      const index = texts.indexOf(text);
      if (index >= 0) texts.splice(index, 1);
      if (texts.length === 0) this.inFlight.delete(chatId);
    };
  }

  sent(chatId: string, messageId: number): void {
    const ids = this.ids.get(chatId) ?? [];
    ids.push(messageId);
    if (ids.length > this.limit) ids.splice(0, ids.length - this.limit);
    this.ids.set(chatId, ids);
  }

  isOwn(chatId: string, messageId: number, text: string): boolean {
    return (this.ids.get(chatId)?.includes(messageId) ?? false) || (this.inFlight.get(chatId)?.includes(text) ?? false);
  }
}
