import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { formatRelative, getApiErrorMessage } from '@/shared/lib'
import { FUNNEL_STAGES } from '@/shared/api'
import { FUNNEL_STAGE_META } from '@/entities/ai-agent'
import {
  useCreateNoteMutation,
  useDeleteNoteMutation,
  useGetCategoriesQuery,
  useGetNotesQuery,
  useUpdateNoteMutation,
} from '@/entities/ai-library'

interface NotesPanelProps {
  accountId: string
}

function scopeLabel(scope: string, categoryTitles: Map<string, string>): string {
  if (scope === 'global') return 'везде'
  if (scope.startsWith('stage:')) {
    const stage = scope.slice(6) as keyof typeof FUNNEL_STAGE_META
    return `этап: ${FUNNEL_STAGE_META[stage]?.label ?? stage}`
  }
  if (scope.startsWith('category:')) return `категория: ${categoryTitles.get(scope.slice(9)) ?? scope.slice(9)}`
  return scope
}

/** Заметки менеджера, которые попадают в промпт: «не предлагай род, пока не спросят». */
export function NotesPanel({ accountId }: NotesPanelProps) {
  const { data, isLoading, error } = useGetNotesQuery(accountId)
  const { data: categories } = useGetCategoriesQuery(accountId)
  const [create, { isLoading: creating, error: createError }] = useCreateNoteMutation()
  const [update] = useUpdateNoteMutation()
  const [remove] = useDeleteNoteMutation()
  const [text, setText] = useState('')
  const [scope, setScope] = useState('global')
  const categoryTitles = new Map((categories ?? []).map((c) => [c.key, c.title]))

  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить заметки')}</Alert>

  const submit = async () => {
    if (!text.trim()) return
    const result = await create({ accountId, body: { text: text.trim(), scope, enabled: true } })
    if (!('error' in result)) setText('')
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Заметка — короткое правило для модели простым языком. Она добавляется в каждый ход по своей области действия.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'flex-start' } }}>
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
        <TextField select size="small" label="Где действует" value={scope} onChange={(e) => setScope(e.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="global">везде</MenuItem>
          {FUNNEL_STAGES.map((stage) => (
            <MenuItem key={stage} value={`stage:${stage}`}>
              этап: {FUNNEL_STAGE_META[stage].label}
            </MenuItem>
          ))}
          {(categories ?? []).map((c) => (
            <MenuItem key={c.key} value={`category:${c.key}`}>
              категория: {c.title}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" loading={creating} disabled={!text.trim()} onClick={() => void submit()} sx={{ flexShrink: 0 }}>
          Добавить
        </Button>
      </Stack>
      {createError && <Alert severity="error">{getApiErrorMessage(createError, 'Не удалось сохранить')}</Alert>}

      {isLoading && <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />}
      {data && data.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          Заметок пока нет.
        </Typography>
      )}
      <Stack spacing={1}>
        {(data ?? []).map((note) => (
          <Stack
            key={note.id}
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider', opacity: note.enabled ? 1 : 0.55 }}
          >
            <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, whiteSpace: 'pre-line' }}>{note.text}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
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
            <IconButton
              size="small"
              onClick={() => {
                if (window.confirm('Удалить заметку?')) void remove({ accountId, id: note.id })
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}
