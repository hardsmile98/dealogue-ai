import type { ChatAgentDto } from '@/shared/api';
import { CHAT_LABEL_LABELS, MODE_LABELS } from './labels';

export type AgentStatusColor = 'success' | 'warning' | 'default';

export interface AgentStatus {
  label: string;
  color: AgentStatusColor;
  /** Клиент ждёт ответа человека: «нужен ответ», «агент недоступен». */
  urgent: boolean;
}

/**
 * Чей чат словами — для списка чатов и кнопки агента в шапке: агент ведёт
 * (зелёный), чат у менеджера (оранжевый, с ярлыком, если он есть), агент
 * выключен (серый). null — агент чат не вёл.
 */
export function agentStatus(agent: ChatAgentDto | null): AgentStatus | null {
  if (!agent) return null;
  if (agent.mode === 'auto') {
    return { label: MODE_LABELS.auto, color: 'success', urgent: false };
  }
  if (agent.mode === 'manager') {
    return {
      label: agent.label ? CHAT_LABEL_LABELS[agent.label] : MODE_LABELS.manager,
      color: 'warning',
      urgent:
        agent.label === 'needs_reply' || agent.label === 'agent_unavailable',
    };
  }
  return { label: MODE_LABELS.off, color: 'default', urgent: false };
}
