import type { TurnMessage } from '../../entities/ai-turn.entity.js';
import type { ComposedMessage } from '../agent.types.js';

/** Сообщение, которое предложил Composer → строка хода в базе. */
export function toTurnMessage(message: ComposedMessage): TurnMessage {
  return { text: message.text, blockId: message.blockId, telegramMessageId: null, sentAt: null };
}
