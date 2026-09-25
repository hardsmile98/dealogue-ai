import { IsIn } from 'class-validator';
import { MANUAL_CHAT_MODES } from '../library/kinds.js';

export type ManualChatMode = (typeof MANUAL_CHAT_MODES)[number];

/** Режим чата руками: `auto` (в том числе возврат от менеджера) или `off`. `manager` ставит только система. */
export class SetChatModeDto {
  @IsIn(MANUAL_CHAT_MODES, { message: 'mode: ожидается auto или off' })
  mode: ManualChatMode;
}
