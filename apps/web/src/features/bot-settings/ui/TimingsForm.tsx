import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { Range, Timings } from '@/shared/api'
import { getApiErrorMessage } from '@/shared/lib'
import { useUpdateBotSettingsMutation } from '../api/botSettingsApi'

interface TimingsFormProps {
  accountId: string
  /** Текущие тайминги с сервера; форма подхватывает их, когда они меняются. */
  initial: Timings
}

type RangeKey = {
  [K in keyof Timings]: Timings[K] extends Range ? K : never
}[keyof Timings]
type NumberKey = Exclude<keyof Timings, RangeKey>

/** Какие тайминги показываем: остальные редкие и живут со значениями по умолчанию. */
const RANGES: { key: RangeKey; label: string; unit: string }[] = [
  { key: 'newLeadReplySec', label: 'Первый ответ новому лиду', unit: 'с' },
  { key: 'diagnosticDelayMin', label: 'Диагностика после ссылок', unit: 'мин' },
  { key: 'returnQuestionMin', label: 'Вопрос после прочтения диагностики', unit: 'мин' },
  { key: 'stepHours', label: 'Ступени при молчании', unit: 'ч' },
]

const NUMBERS: { key: NumberKey; label: string; unit: string }[] = [
  { key: 'unreadReminderHours', label: 'Напоминание о непрочитанном', unit: 'ч' },
  { key: 'maxReminders', label: 'Напоминаний на чат, не больше', unit: '' },
  { key: 'maxTurnsWithoutNudge', label: 'Ходов подряд без шага воронки', unit: '' },
]

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Тайминги агента: диапазоны — случайное значение внутри них. */
export function TimingsForm({ accountId, initial }: TimingsFormProps) {
  const [timings, setTimings] = useState<Timings>(initial)
  const [update, { isLoading }] = useUpdateBotSettingsMutation()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Сервер прислал новые тайминги — подхватываем их без перемонтирования формы.
  const initialJson = JSON.stringify(initial)
  const [syncedJson, setSyncedJson] = useState(initialJson)
  if (syncedJson !== initialJson) {
    setSyncedJson(initialJson)
    setTimings(JSON.parse(initialJson) as Timings)
  }

  const dirty = JSON.stringify(timings) !== initialJson

  const setRange = (key: RangeKey, part: keyof Range, value: string) => {
    setTimings((current) => ({ ...current, [key]: { ...current[key], [part]: toInt(value) } }))
  }

  const submit = async () => {
    setError(null)
    setSaved(false)
    try {
      await update({ accountId, body: { timings } }).unwrap()
      setSaved(true)
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'Не удалось сохранить тайминги'))
    }
  }

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Grid container spacing={2}>
        {RANGES.map(({ key, label, unit }) => (
          <Grid key={key} size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {label}
              {unit && `, ${unit}`}
            </Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                label="от"
                type="number"
                size="small"
                value={timings[key].min}
                onChange={(event) => setRange(key, 'min', event.target.value)}
                slotProps={{ htmlInput: { min: 0 } }}
              />
              <TextField
                label="до"
                type="number"
                size="small"
                value={timings[key].max}
                onChange={(event) => setRange(key, 'max', event.target.value)}
                slotProps={{ htmlInput: { min: 0 } }}
              />
            </Stack>
          </Grid>
        ))}
        {NUMBERS.map(({ key, label, unit }) => (
          <Grid key={key} size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              label={unit ? `${label}, ${unit}` : label}
              type="number"
              size="small"
              value={timings[key]}
              onChange={(event) => setTimings({ ...timings, [key]: toInt(event.target.value) })}
              slotProps={{ htmlInput: { min: 0 } }}
              fullWidth
            />
          </Grid>
        ))}
      </Grid>

      {error && <Alert severity="error">{error}</Alert>}
      {saved && !dirty && <Alert severity="success">Тайминги сохранены.</Alert>}

      <Button type="submit" variant="contained" loading={isLoading} disabled={!dirty} sx={{ alignSelf: 'flex-start' }}>
        Сохранить тайминги
      </Button>
    </Stack>
  )
}
