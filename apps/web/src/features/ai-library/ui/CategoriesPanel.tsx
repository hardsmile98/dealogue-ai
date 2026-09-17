import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { getApiErrorMessage } from '@/shared/lib'
import type { CategoryDto, CategoryInput } from '@/shared/api'
import {
  CATEGORY_GROUP_LABELS,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
  useUpdateCategoryMutation,
} from '@/entities/ai-library'

interface CategoriesPanelProps {
  accountId: string
}

const EMPTY: CategoryInput = {
  key: '',
  groupKey: 'other',
  title: '',
  description: '',
  clarifyingFactKey: null,
  clarifyingQuestion: null,
  enabled: true,
  sortOrder: 0,
}

/** Категории запросов: по ним выбирается диагностика; описание читает модель. */
export function CategoriesPanel({ accountId }: CategoriesPanelProps) {
  const { data, isLoading, error } = useGetCategoriesQuery(accountId)
  const [editing, setEditing] = useState<{ id: string | null; value: CategoryInput } | null>(null)
  const [remove] = useDeleteCategoryMutation()
  const [update] = useUpdateCategoryMutation()

  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить категории')}</Alert>

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          Описание категории читает модель, когда решает, о чём запрос клиента. Уточняющий вопрос задаётся, если без него
          не выбрать диагностику.
        </Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ id: null, value: EMPTY })}>
          Добавить
        </Button>
      </Stack>
      {isLoading && <Skeleton variant="rounded" height={200} sx={{ borderRadius: 3 }} />}
      {data && data.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          Категорий пока нет.
        </Typography>
      )}
      {data && data.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Группа</TableCell>
              <TableCell>Категория</TableCell>
              <TableCell>Когда выбирать</TableCell>
              <TableCell>Уточнение</TableCell>
              <TableCell align="center">Вкл.</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id} hover sx={{ opacity: row.enabled ? 1 : 0.55 }}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Chip size="small" variant="outlined" label={CATEGORY_GROUP_LABELS[row.groupKey] ?? row.groupKey} />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{row.title}</Typography>
                  <Typography variant="caption" color="text.disabled">
                    {row.key}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontSize: 13, maxWidth: 420 }}>{row.description}</TableCell>
                <TableCell sx={{ fontSize: 12, maxWidth: 260 }}>{row.clarifyingQuestion ?? '—'}</TableCell>
                <TableCell align="center">
                  <Switch
                    size="small"
                    checked={row.enabled}
                    onChange={(e) => void update({ accountId, id: row.id, patch: { enabled: e.target.checked } })}
                  />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" onClick={() => setEditing({ id: row.id, value: toInput(row) })}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (window.confirm('Удалить категорию? Диагностики с этой категорией останутся, но перестанут выбираться.')) {
                        void remove({ accountId, id: row.id })
                      }
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {editing && (
        <CategoryDialog accountId={accountId} id={editing.id} initial={editing.value} onClose={() => setEditing(null)} />
      )}
    </Stack>
  )
}

function toInput(row: CategoryDto): CategoryInput {
  return {
    key: row.key,
    groupKey: row.groupKey,
    title: row.title,
    description: row.description,
    clarifyingFactKey: row.clarifyingFactKey,
    clarifyingQuestion: row.clarifyingQuestion,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
  }
}

function CategoryDialog({
  accountId,
  id,
  initial,
  onClose,
}: {
  accountId: string
  id: string | null
  initial: CategoryInput
  onClose: () => void
}) {
  const [form, setForm] = useState(initial)
  const [create, { isLoading: creating, error: createError }] = useCreateCategoryMutation()
  const [update, { isLoading: updating, error: updateError }] = useUpdateCategoryMutation()
  const error = createError ?? updateError

  const submit = async () => {
    const body = {
      ...form,
      clarifyingFactKey: form.clarifyingQuestion?.trim() ? form.clarifyingFactKey || 'clarify' : null,
      clarifyingQuestion: form.clarifyingQuestion?.trim() || null,
    }
    const result = id ? await update({ accountId, id, patch: body }) : await create({ accountId, body })
    if (!('error' in result)) onClose()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{id ? 'Редактировать категорию' : 'Новая категория'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              size="small"
              label="Группа"
              value={form.groupKey}
              onChange={(e) => setForm({ ...form, groupKey: e.target.value })}
              sx={{ width: 220 }}
            >
              {Object.entries(CATEGORY_GROUP_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              fullWidth
              label="Ключ"
              helperText="латиница и точки: money.debts"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
          </Stack>
          <TextField size="small" fullWidth label="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            label="Когда выбирать (для модели)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <TextField
            size="small"
            fullWidth
            label="Уточняющий вопрос (необязательно)"
            helperText="Если без ответа на него не выбрать диагностику."
            value={form.clarifyingQuestion ?? ''}
            onChange={(e) => setForm({ ...form, clarifyingQuestion: e.target.value })}
          />
          <FormControlLabel
            control={<Switch size="small" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />}
            label="Включена"
          />
          {error && <Alert severity="error">{getApiErrorMessage(error, 'Не удалось сохранить')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          loading={creating || updating}
          disabled={!form.key.trim() || !form.title.trim()}
          onClick={() => void submit()}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}
