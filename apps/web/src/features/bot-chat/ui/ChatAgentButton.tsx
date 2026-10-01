import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import type { ChatBotStateDto } from '@/shared/api';
import { agentStatus, useGetChatBotStateQuery } from '@/entities/bot';

/** Страховка на случай обрыва живых событий — они и так обновляют состояние. */
const POLL_MS = 30_000;

type ButtonColor = 'success' | 'warning' | 'inherit';

/** Агент не ведёт чат — кнопка спокойная, без чёрной рамки цвета текста. */
const neutralSx = { color: 'text.secondary', borderColor: 'divider' } as const;

function describe(state: ChatBotStateDto | null): {
  label: string;
  color: ButtonColor;
} {
  const status = agentStatus(state);
  if (!status) return { label: 'Агент не ведёт', color: 'inherit' };
  return {
    label: status.label,
    color: status.color === 'default' ? 'inherit' : status.color,
  };
}

interface ChatAgentButtonProps {
  accountId: string;
  chatId: string;
  onOpen: () => void;
}

/** Кнопка в шапке чата: чей сейчас чат — агента или менеджера; открывает панель агента. */
export function ChatAgentButton({
  accountId,
  chatId,
  onOpen,
}: ChatAgentButtonProps) {
  const { data } = useGetChatBotStateQuery(
    { accountId, chatId },
    { pollingInterval: POLL_MS },
  );
  const { label, color } = describe(data?.state ?? null);

  return (
    <Tooltip
      title="Агент в этом чате: режим, журнал ходов, память о клиенте"
      describeChild
    >
      <Button
        size="small"
        variant="outlined"
        color={color}
        startIcon={<SmartToyOutlinedIcon />}
        onClick={onOpen}
        aria-haspopup="dialog"
        sx={color === 'inherit' ? neutralSx : undefined}
      >
        {label}
      </Button>
    </Tooltip>
  );
}
