import { useState } from 'react'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import { LANGUAGES, LIBRARY_KINDS, LIBRARY_KIND_LABELS, OBJECTION_CATEGORIES, OBJECTION_LABELS, REQUEST_CATEGORIES } from '@/shared/api'
import type { Gender, Language, LibraryItemBody, LibraryKind } from '@/shared/api'
import { FormDialog } from '@/shared/ui'

interface LibraryItemDialogProps {
  title: string
  initial: LibraryItemBody
  onClose: () => void
  onSubmit: (body: LibraryItemBody) => void
  submitting: boolean
  error?: unknown
}

/** Категория нужна диагностикам (запрос клиента) и возражениям (плейбук). */
function categoryOptions(kind: LibraryKind): { key: string; title: string }[] | null {
  if (kind === 'diagnostic') return [...REQUEST_CATEGORIES]
  if (kind === 'objection') return OBJECTION_CATEGORIES.map((key) => ({ key, title: OBJECTION_LABELS[key] }))
  return null
}

/** Элемент библиотеки. В текстах можно ставить {{bio}} и {{links}} — их подставит образ. */
export function LibraryItemDialog({ title, initial, onClose, onSubmit, submitting, error }: LibraryItemDialogProps) {
  const [form, setForm] = useState<LibraryItemBody>(initial)
  const set = <K extends keyof LibraryItemBody>(key: K, value: LibraryItemBody[K]) => setForm((current) => ({ ...current, [key]: value }))
  const categories = categoryOptions(form.kind)
  const valid = form.title.trim() !== '' && form.text.trim() !== ''

  return (
    <FormDialog
      open
      title={title}
      onClose={onClose}
      onSubmit={() =>
        onSubmit({
          kind: form.kind,
          language: form.language,
          gender: form.gender,
          category: categories ? form.category : null,
          title: form.title.trim(),
          text: form.text.trim(),
          enabled: form.enabled,
        })
      }
      submitting={submitting}
      submitDisabled={!valid}
      error={error}
      maxWidth="md"
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField select fullWidth label="Вид" value={form.kind} onChange={(event) => set('kind', event.target.value as LibraryKind)}>
          {LIBRARY_KINDS.map((kind) => (
            <MenuItem key={kind} value={kind}>
              {LIBRARY_KIND_LABELS[kind]}
            </MenuItem>
          ))}
        </TextField>
        <TextField select label="Язык" value={form.language} onChange={(event) => set('language', event.target.value as Language)} sx={{ minWidth: 110 }}>
          {LANGUAGES.map((language) => (
            <MenuItem key={language} value={language}>
              {language}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Пол клиента"
          value={form.gender ?? ''}
          onChange={(event) => set('gender', (event.target.value || null) as Gender | null)}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">любой</MenuItem>
          <MenuItem value="f">женщина</MenuItem>
          <MenuItem value="m">мужчина</MenuItem>
        </TextField>
      </Stack>
      {categories && (
        <TextField select label="Категория" value={form.category ?? ''} onChange={(event) => set('category', event.target.value || null)}>
          <MenuItem value="">без категории</MenuItem>
          {categories.map((category) => (
            <MenuItem key={category.key} value={category.key}>
              {category.title}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField label="Название" value={form.title} onChange={(event) => set('title', event.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
      <TextField
        label="Текст"
        multiline
        minRows={6}
        maxRows={20}
        value={form.text}
        onChange={(event) => set('text', event.target.value)}
        helperText="{{bio}} и {{links}} подставятся из образа практика"
      />
      <FormControlLabel control={<Switch checked={form.enabled} onChange={(event) => set('enabled', event.target.checked)} />} label="Агент использует этот текст" />
    </FormDialog>
  )
}
