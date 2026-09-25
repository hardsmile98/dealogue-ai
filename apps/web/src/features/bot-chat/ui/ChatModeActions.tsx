import Button from '@mui/material/Button';
import type { ChatBotStateDto, ChatQuery, ManualChatMode } from '@/shared/api';
import { getApiErrorMessage } from '@/shared/lib';
import { ConfirmAction, useNotify } from '@/shared/ui';
import { useSetChatModeMutation } from '../api/botChatApi';

interface ChatModeActionsProps extends ChatQuery {
  state: ChatBotStateDto | null;
}

/**
 * Включить или выключить агента в одном чате. Выключить можно сразу —
 * это безопасно; передать чат агенту — только с подтверждением: он начнёт
 * писать живому клиенту в Telegram.
 */
export function ChatModeActions({
  accountId,
  chatId,
  state,
}: ChatModeActionsProps) {
  const [setMode, { isLoading }] = useSetChatModeMutation();
  const notify = useNotify();
  const fromManager = state?.mode === 'manager';

  const change = async (mode: ManualChatMode) => {
    await setMode({ accountId, chatId, mode }).unwrap();
    notify.success(
      mode === 'auto' ? 'Агент ведёт этот чат' : 'Агент выключен в этом чате',
    );
  };

  if (state?.mode === 'auto') {
    return (
      <Button
        size="small"
        variant="outlined"
        loading={isLoading}
        onClick={() =>
          void change('off').catch((error: unknown) =>
            notify.error(
              getApiErrorMessage(error, 'Не удалось выключить агента'),
            ),
          )
        }
      >
        Выключить агента в этом чате
      </Button>
    );
  }

  return (
    <ConfirmAction
      question={fromManager ? 'Вернуть чат агенту?' : 'Передать чат агенту?'}
      description="Агент начнёт отвечать клиенту в Telegram от имени аккаунта: на следующее его сообщение и по лестнице молчания."
      confirmLabel="Передать агенту"
      errorText="Не удалось передать чат агенту"
      onConfirm={() => change('auto')}
    >
      {(ask) => (
        <Button
          size="small"
          variant="contained"
          disabled={isLoading}
          onClick={ask}
        >
          {fromManager ? 'Вернуть агенту' : 'Передать агенту'}
        </Button>
      )}
    </ConfirmAction>
  );
}
