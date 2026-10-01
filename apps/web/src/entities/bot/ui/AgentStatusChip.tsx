import Chip from '@mui/material/Chip';
import type { ChatAgentDto } from '@/shared/api';
import { agentStatus } from '../lib/agentStatus';
import { agentModeIcon } from './agentModeIcon';

/**
 * Чей чат в списке: «Ведёт агент», ярлык менеджера («Нужен ответ» — залитым,
 * чтобы бросался в глаза), «Агент выключен». Агент чат не вёл — ничего.
 */
export function AgentStatusChip({ agent }: { agent: ChatAgentDto | null }) {
  const status = agentStatus(agent);
  if (!agent || !status) return null;
  return (
    <Chip
      size="small"
      icon={agentModeIcon(agent.mode)}
      color={status.color}
      variant={status.urgent ? 'filled' : 'outlined'}
      label={status.label}
    />
  );
}
