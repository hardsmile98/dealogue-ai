import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
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
import { FACT_GROUPS } from '@/shared/api'
import type { FactDto, FactGroup, FactInput } from '@/shared/api'
import {
  FACT_GROUP_LABELS,
  useCreateFactMutation,
  useDeleteFactMutation,
  useGetFactsQuery,
  useUpdateFactMutation,
} from '@/entities/ai-library'

interface FactsPanelProps {
  accountId: string
}

const EMPTY: FactInput = { group: 'service', key: '', title: '', value: '', enabled: true, sortOrder: 0 }

/** Факты об услугах и персоне — единственный источник цен, ссылок и сроков для бота. */
export function FactsPanel({ accountId }: FactsPanelProps) {
  const { data, isLoading, error } = useGetFactsQuery(accountId)
  const [editing, setEditing] = useState<{ id: string | null; value: FactInput } | null>(null)
  const [remove] = useDeleteFactMutation()
  const [update] = useUpdateFactMutation()

  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить факты')}</Alert>

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          Бот называет только те цены, ссылки и сроки, что записаны здесь. Всё остальное он говорить не имеет права —
          проверка отклонит ответ.
        </Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ id: null, value: EMPTY })}>
          Добавить
        </Button>
      </Stack>
      {isLoading && <Skeleton variant="rounded" height={200} sx={{ borderRadius: 3 }} />}
      {data && data.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          Фактов пока нет.
        </Typography>
      )}
      {data && data.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Группа</TableCell>
              <TableCell>Ключ и название</TableCell>
              <TableCell>Значение</TableCell>
              <TableCell align="center">Вкл.</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.id} hover sx={{ opacity: row.enabled ? 1 : 0.55 }}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Chip size="small" label={FACT_GROUP_LABELS[row.group]} />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{row.title}</Typography>
                  <Typography variant="caption" color="text.disabled">
                    {row.key}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontSize: 13, whiteSpace: 'pre-line' }}>{row.value}</TableCell>
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
                      if (window.confirm('Удалить факт?')) void remove({ accountId, id: row.id })
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
      {editing && <FactDialog accountId={accountId} id={editing.id} initial={editing.value} onClose={() => setEditing(null)} />}
    </Stack>
  )
}

function toInput(row: FactDto): FactInput {
  return { group: row.group, key: row.key, title: row.title, value: row.value, enabled: row.enabled, sortOrder: row.sortOrder }
}

function FactDialog({ accountId, id, initial, onClose }: { accountId: string; id: string | null; initial: FactInput; onClose: () => void }) {
  const [form, setForm] = useState(initial)
  const [create, { isLoading: creating, error: createError }] = useCreateFactMutation()
  const [update, { isLoading: updating, error: updateError }] = useUpdateFactMutation()
  const error = createError ?? updateError

  const submit = async () => {
    const result = id ? await update({ accountId, id, patch: form }) : await create({ accountId, body: form })
    if (!('error' in result)) onClose()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{id ? 'Редактировать факт' : 'Новый факт'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1.5}>
            <TextField
              select
              size="small"
              label="Группа"
              value={form.group}
              onChange={(e) => setForm({ ...form, group: e.target.value as FactGroup })}
              sx={{ width: 220 }}
            >
              {FACT_GROUPS.map((group) => (
                <MenuItem key={group} value={group}>
                  {FACT_GROUP_LABELS[group]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              fullWidth
              label="Ключ"
              helperText="латиница и точки: price.cleaning"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
          </Stack>
          <TextField size="small" fullWidth label="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={3}
            label="Значение"
            helperText="Как есть, так и будет сказано клиенту: цифры, сроки, ссылки."
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
          <FormControlLabel
            control={<Switch size="small" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />}
            label="Включён"
          />
          {error && <Alert severity="error">{getApiErrorMessage(error, 'Не удалось сохранить')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          loading={creating || updating}
          disabled={!form.key.trim() || !form.title.trim() || !form.value.trim()}
          onClick={() => void submit()}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}
