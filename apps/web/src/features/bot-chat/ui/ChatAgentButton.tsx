import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import type { ChatBotStateDto } from '@/shared/api';
import { CHAT_LABEL_LABELS, useGetChatBotStateQuery } from '@/entities/bot';

/** Страховка на случай обрыва живых событий — они и так обновляют состояние. */
const POLL_MS = 30_000;

type ButtonColor = 'success' | 'warning' | 'inherit';

/** Агент не ведёт чат — кнопка спокойная, без чёрной рамки цвета текста. */
const neutralSx = { color: 'text.secondary', borderColor: 'divider' } as const;

function describe(state: ChatBotStateDto | null): {
  label: string;
  color: ButtonColor;
} {
  if (!state) return { label: 'Агент не ведёт', color: 'inherit' };
  if (state.mode === 'auto') return { label: 'Ведёт агент', color: 'success' };
  if (state.mode === 'manager') {
    return {
      label: state.label ? CHAT_LABEL_LABELS[state.label] : 'У менеджера',
      color: 'warning',
    };
  }
  return { label: 'Агент выключен', color: 'inherit' };
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
