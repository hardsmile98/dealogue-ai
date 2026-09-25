import Chip from '@mui/material/Chip';
import type { ChatMode } from '@/shared/api';
import { MODE_LABELS, modeColor } from '../lib/labels';

/** Чей чат: «Ведёт агент», «У менеджера», «Агент выключен». */
export function ChatModeChip({ mode }: { mode: ChatMode }) {
  return (
    <Chip size="small" color={modeColor(mode)} label={MODE_LABELS[mode]} />
  );
}
