import Chip from '@mui/material/Chip';
import type { Stage } from '@/shared/api';
import { STAGE_LABELS } from '../lib/labels';

/** Этап воронки: последняя доставленная веха. */
export function StageChip({ stage }: { stage: Stage }) {
  return <Chip size="small" variant="outlined" label={STAGE_LABELS[stage]} />;
}
