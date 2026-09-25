import { useState } from 'react'
import Alert from '@mui/material/Alert'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { formatDateTime, getApiErrorMessage } from '@/shared/lib'
import type { BotSettingsDto } from '@/shared/api'
import { useSetBotEnabledMutation } from '../api/botSettingsApi'

interface AgentToggleProps {
  settings: BotSettingsDto
}

/** Включение агента на аккаунте: берёт только диалоги, начатые клиентом после включения. */
export function AgentToggle({ settings }: AgentToggleProps) {
  const [setEnabled, { isLoading }] = useSetBotEnabledMutation()
  const [error, setError] = useState<string | null>(null)

  const toggle = async (enabled: boolean) => {
    setError(null)
    try {
      await setEnabled({ accountId: settings.accountId, enabled }).unwrap()
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'Не удалось изменить состояние агента'))
    }
  }

  const libraryEmpty = settings.library.total === 0

  return (
    <Stack spacing={1.5}>
      <FormControlLabel
        control={
          <Switch
            checked={settings.enabled}
            disabled={isLoading}
            onChange={(event) => void toggle(event.target.checked)}
          />
        }
        label={settings.enabled ? 'Агент включён' : 'Агент выключен'}
      />
      <Typography variant="body2" color="text.secondary">
        {settings.enabled && settings.enabledAt
          ? `Берёт диалоги, начатые клиентами после ${formatDateTime(settings.enabledAt)}. Старые чаты не трогает.`
          : 'После включения агент возьмёт только новые диалоги, начатые клиентами. Старые чаты не трогает.'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Отдельный чат можно передать агенту или забрать у него кнопкой «Агент» в переписке — это работает и при
        выключенном переключателе.
      </Typography>
      {settings.enabled && libraryEmpty && (
        <Alert severity="warning">
          Библиотека пуста: без диагностик, описания услуг и цен агент не сможет вести воронку.
          Загрузите стандартную библиотеку ниже.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  )
}
