import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { formatRelative, getApiErrorMessage, isMutationSuccess } from '@/shared/lib'
import { ConfirmAction, QueryBoundary } from '@/shared/ui'
import { FUNNEL_STAGES } from '@/shared/api'
import { FUNNEL_STAGE_META } from '@/entities/ai-agent'
import {
  useCreateNoteMutation,
  useDeleteNoteMutation,
  useGetCategoriesQuery,
  useGetNotesQuery,
  useUpdateNoteMutation,
} from '@/entities/ai-library'
import { agentLibraryStyles as styles } from './AgentLibrary.styles'

interface NotesPanelProps {
  accountId: string
}

/** Область действия заметки в читаемом виде: «везде», «этап: Цены», «категория: Долги». */
function scopeLabel(scope: string, categoryTitles: Map<string, string>): string {
  if (scope === 'global') return 'везде'
  if (scope.startsWith('stage:')) {
    const stage = scope.slice(6) as keyof typeof FUNNEL_STAGE_META
    return `этап: ${FUNNEL_STAGE_META[stage]?.label ?? stage}`
  }
  if (scope.startsWith('category:')) {
    const key = scope.slice(9)
    return `категория: ${categoryTitles.get(key) ?? key}`
  }
  return scope
}

/** Заметки менеджера, которые попадают в промпт: «не предлагай род, пока не спросят». */
export function NotesPanel({ accountId }: NotesPanelProps) {
  const query = useGetNotesQuery({ accountId })
  const { data: categories } = useGetCategoriesQuery({ accountId })
  const [create, { isLoading: creating, error: createError }] = useCreateNoteMutation()
  const [update] = useUpdateNoteMutation()
  const [remove] = useDeleteNoteMutation()
  const [text, setText] = useState('')
  const [scope, setScope] = useState('global')

  const categoryTitles = new Map((categories ?? []).map((category) => [category.key, category.title]))

  const submit = async () => {
    if (!text.trim()) return
    const result = await create({ accountId, body: { text: text.trim(), scope, enabled: true } })
    if (isMutationSuccess(result)) setText('')
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Заметка — короткое правило для модели простым языком. Она добавляется в каждый ход по своей области действия.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={styles.header}>
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={2}
          label="Новая заметка"
          placeholder="Не предлагай работу с родом, пока клиент сам не спросит"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <TextField
          select
          size="small"
          label="Где действует"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          sx={styles.dialogSelect}
        >
          <MenuItem value="global">везде</MenuItem>
          {FUNNEL_STAGES.map((stage) => (
            <MenuItem key={stage} value={`stage:${stage}`}>
              этап: {FUNNEL_STAGE_META[stage].label}
            </MenuItem>
          ))}
          {(categories ?? []).map((category) => (
            <MenuItem key={category.key} value={`category:${category.key}`}>
              категория: {category.title}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" loading={creating} disabled={!text.trim()} onClick={() => void submit()}>
          Добавить
        </Button>
      </Stack>
      {createError && <Alert severity="error">{getApiErrorMessage(createError, 'Не удалось сохранить')}</Alert>}

      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить заметки"
        skeleton={120}
        empty="Заметок пока нет."
      >
        {(notes) => (
          <Stack spacing={1}>
            {notes.map((note) => (
              <Stack
                key={note.id}
                direction="row"
                spacing={1}
                sx={[styles.noteRow, ...(note.enabled ? [] : [styles.disabledRow])]}
              >
                <Stack sx={styles.grow}>
                  <Typography sx={styles.textCell}>{note.text}</Typography>
                  <Stack direction="row" spacing={1} sx={styles.noteMeta}>
                    <Chip size="small" variant="outlined" label={scopeLabel(note.scope, categoryTitles)} />
                    <Typography variant="caption" color="text.disabled">
                      {note.source === 'from_rating' ? 'из оценки хода' : 'вручную'} · {formatRelative(note.createdAt)}
                    </Typography>
                  </Stack>
                </Stack>
                <Switch
                  size="small"
                  checked={note.enabled}
                  onChange={(e) => void update({ accountId, id: note.id, patch: { enabled: e.target.checked } })}
                />
                <ConfirmAction
                  question="Удалить заметку?"
                  confirmLabel="Удалить"
                  destructive
                  onConfirm={() => void remove({ accountId, id: note.id })}
                >
                  {(ask) => (
                    <IconButton size="small" onClick={ask} aria-label="Удалить">
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </ConfirmAction>
              </Stack>
            ))}
          </Stack>
        )}
      </QueryBoundary>
    </Stack>
  )
}
