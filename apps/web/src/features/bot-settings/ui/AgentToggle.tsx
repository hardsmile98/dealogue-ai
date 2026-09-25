import Alert from '@mui/material/Alert';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import type { BotSettingsDto } from '@/shared/api';
import { formatDateTime, getApiErrorMessage } from '@/shared/lib';
import { ConfirmAction, useNotify } from '@/shared/ui';
import { useSetBotEnabledMutation } from '../api/botSettingsApi';

interface AgentToggleProps {
  settings: BotSettingsDto;
}

/**
 * Включение агента на аккаунте: берёт только диалоги, начатые клиентом после
 * включения. Включение — с подтверждением: агент начнёт писать живым людям.
 * Выключение — сразу, это безопасно.
 */
export function AgentToggle({ settings }: AgentToggleProps) {
  const [setEnabled, { isLoading }] = useSetBotEnabledMutation();
  const notify = useNotify();
  const libraryEmpty = settings.library.total === 0;

  const change = async (enabled: boolean) => {
    await setEnabled({ accountId: settings.accountId, enabled }).unwrap();
    notify.success(enabled ? 'Агент включён' : 'Агент выключен');
  };

  const disable = () =>
    change(false).catch((error: unknown) =>
      notify.error(getApiErrorMessage(error, 'Не удалось выключить агента')),
    );

  return (
    <Stack spacing={1.5}>
      <ConfirmAction
        question="Включить агента на аккаунте?"
        description={
          <>
            Агент начнёт от имени аккаунта отвечать в Telegram клиентам, которые
            напишут впервые после включения. Старые чаты он не трогает.
            {libraryEmpty &&
              ' Библиотека пуста — без диагностик, услуг и цен агент не доведёт клиента до цен.'}
          </>
        }
        confirmLabel="Включить"
        errorText="Не удалось включить агента"
        onConfirm={() => change(true)}
      >
        {(ask) => (
          <FormControlLabel
            control={
              <Switch
                checked={settings.enabled}
                disabled={isLoading}
                onChange={(event) => {
                  if (event.target.checked) ask();
                  else void disable();
                }}
              />
            }
            label={settings.enabled ? 'Агент включён' : 'Агент выключен'}
          />
        )}
      </ConfirmAction>
      <Typography variant="body2" color="text.secondary">
        {settings.enabled && settings.enabledAt
          ? `Берёт диалоги, начатые клиентами после ${formatDateTime(settings.enabledAt)}. Старые чаты не трогает.`
          : 'После включения агент возьмёт только новые диалоги, начатые клиентами. Старые чаты не трогает.'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Отдельный чат можно передать агенту или забрать у него кнопкой «Агент» в
        переписке — это работает и при выключенном переключателе.
      </Typography>
      {settings.enabled && libraryEmpty && (
        <Alert severity="warning">
          Библиотека пуста: без диагностик, описания услуг и цен агент не сможет
          вести воронку. Загрузите стандартную библиотеку.
        </Alert>
      )}
    </Stack>
  );
}
