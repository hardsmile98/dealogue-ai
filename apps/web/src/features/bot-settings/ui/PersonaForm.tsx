import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import type { Persona, PersonaLink } from '@/shared/api'
import { getApiErrorMessage } from '@/shared/lib'
import { useUpdateBotSettingsMutation } from '../api/botSettingsApi'

interface PersonaFormProps {
  accountId: string
  /** Текущий образ с сервера; форма подхватывает его, когда он меняется. */
  initial: Persona
}

const LINK_PLACEHOLDERS: PersonaLink[] = [
  { title: '🔮 Instagram', url: 'https://www.instagram.com/…' },
  { title: '📲 Telegram', url: 'https://t.me/…' },
]

/**
 * Образ практика: имя, пол, биография, ссылки на страницы. Биография
 * подставляется в тексты библиотеки вместо {{bio}}, ссылки — вместо {{links}}.
 */
export function PersonaForm({ accountId, initial }: PersonaFormProps) {
  const [persona, setPersona] = useState<Persona>(initial)
  const [update, { isLoading }] = useUpdateBotSettingsMutation()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Сервер прислал новый образ (после сохранения или обновления кэша) —
  // подхватываем его, не перемонтируя форму: иначе теряется «сохранено».
  const initialJson = JSON.stringify(initial)
  const [syncedJson, setSyncedJson] = useState(initialJson)
  if (syncedJson !== initialJson) {
    setSyncedJson(initialJson)
    setPersona(JSON.parse(initialJson) as Persona)
  }

  const dirty = JSON.stringify(persona) !== initialJson

  const setLink = (index: number, patch: Partial<PersonaLink>) => {
    setPersona((current) => ({
      ...current,
      links: current.links.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    }))
  }

  const submit = async () => {
    setError(null)
    setSaved(false)
    try {
      await update({ accountId, body: { persona } }).unwrap()
      setSaved(true)
    } catch (caught) {
      setError(getApiErrorMessage(caught, 'Не удалось сохранить образ'))
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
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Имя"
          value={persona.name}
          onChange={(event) => setPersona({ ...persona, name: event.target.value })}
          required
          fullWidth
        />
        <TextField
          select
          label="Пол практика"
          value={persona.gender}
          onChange={(event) => setPersona({ ...persona, gender: event.target.value as Persona['gender'] })}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="m">Мужской</MenuItem>
          <MenuItem value="f">Женский</MenuItem>
        </TextField>
      </Stack>

      <TextField
        label="Биография"
        helperText="Откуда, где живёт, как пришёл к практике. Подставляется в тексты вместо {{bio}} и нужна, чтобы отвечать на вопросы о себе."
        value={persona.bio}
        onChange={(event) => setPersona({ ...persona, bio: event.target.value })}
        multiline
        minRows={3}
        fullWidth
      />

      <Stack spacing={1}>
        <Typography variant="subtitle2">Ссылки на страницы</Typography>
        <Typography variant="body2" color="text.secondary">
          Подставляются в тексты вместо {'{{links}}'}: подпись с эмодзи и адрес с новой строки.
        </Typography>
        {persona.links.map((link, index) => (
          <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              label="Подпись"
              placeholder={LINK_PLACEHOLDERS[index % LINK_PLACEHOLDERS.length]?.title}
              value={link.title}
              onChange={(event) => setLink(index, { title: event.target.value })}
              size="small"
              sx={{ width: 200 }}
            />
            <TextField
              label="Адрес"
              placeholder={LINK_PLACEHOLDERS[index % LINK_PLACEHOLDERS.length]?.url}
              value={link.url}
              onChange={(event) => setLink(index, { url: event.target.value })}
              size="small"
              fullWidth
            />
            <IconButton
              aria-label="Убрать ссылку"
              onClick={() =>
                setPersona({ ...persona, links: persona.links.filter((_, i) => i !== index) })
              }
            >
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        {persona.links.length < 10 && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setPersona({ ...persona, links: [...persona.links, { title: '', url: '' }] })}
            sx={{ alignSelf: 'flex-start' }}
          >
            Добавить ссылку
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {saved && !dirty && <Alert severity="success">Образ сохранён.</Alert>}

      <Button type="submit" variant="contained" loading={isLoading} disabled={!dirty} sx={{ alignSelf: 'flex-start' }}>
        Сохранить образ
      </Button>
    </Stack>
  )
}
