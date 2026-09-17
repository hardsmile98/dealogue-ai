import { useMemo, useState } from 'react'
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
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { getApiErrorMessage } from '@/shared/lib'
import { PHRASE_KINDS } from '@/shared/api'
import type { Gender, PhraseDto, PhraseInput, PhraseKind, PhraseUsage } from '@/shared/api'
import {
  GENDER_LABELS,
  PHRASE_KIND_META,
  SOURCE_LABELS,
  useCreatePhraseMutation,
  useDeletePhraseMutation,
  useGetCategoriesQuery,
  useGetPhrasesQuery,
  useUpdatePhraseMutation,
} from '@/entities/ai-library'
import { SplitPreview } from './SplitPreview'

interface PhrasesPanelProps {
  accountId: string
}

const EMPTY: PhraseInput = {
  usage: 'example',
  kind: 'greeting',
  categoryKey: null,
  gender: null,
  language: 'ru',
  title: '',
  text: '',
  conditions: {},
  enabled: true,
  weight: 1,
  sortOrder: 0,
}

/** Образцы и блоки по видам с фильтрами; редактор в диалоге с предпросмотром разбиения. */
export function PhrasesPanel({ accountId }: PhrasesPanelProps) {
  const { data, isLoading, error } = useGetPhrasesQuery({ accountId })
  const [kindFilter, setKindFilter] = useState<PhraseKind | 'all'>('all')
  const [usageFilter, setUsageFilter] = useState<PhraseUsage | 'all'>('all')
  const [editing, setEditing] = useState<{ id: string | null; value: PhraseInput } | null>(null)
  const [remove] = useDeletePhraseMutation()
  const [update] = useUpdatePhraseMutation()

  const visible = useMemo(
    () =>
      (data ?? []).filter(
        (row) => (kindFilter === 'all' || row.kind === kindFilter) && (usageFilter === 'all' || row.usage === usageFilter),
      ),
    [data, kindFilter, usageFilter],
  )
  const countsByKind = useMemo(() => {
    const counts = new Map<PhraseKind, { total: number; enabled: number }>()
    for (const row of data ?? []) {
      const entry = counts.get(row.kind) ?? { total: 0, enabled: 0 }
      entry.total += 1
      if (row.enabled) entry.enabled += 1
      counts.set(row.kind, entry)
    }
    return counts
  }, [data])

  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить библиотеку')}</Alert>

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
        <Chip
          size="small"
          label="Все виды"
          color={kindFilter === 'all' ? 'primary' : 'default'}
          variant={kindFilter === 'all' ? 'filled' : 'outlined'}
          onClick={() => setKindFilter('all')}
        />
        {PHRASE_KINDS.map((kind) => {
          const counts = countsByKind.get(kind)
          return (
            <Tooltip key={kind} title={PHRASE_KIND_META[kind].hint}>
              <Chip
                size="small"
                label={`${PHRASE_KIND_META[kind].label}${counts ? ` · ${counts.enabled}/${counts.total}` : ''}`}
                color={kindFilter === kind ? 'primary' : counts?.enabled ? 'default' : 'warning'}
                variant={kindFilter === kind ? 'filled' : 'outlined'}
                onClick={() => setKindFilter(kind)}
              />
            </Tooltip>
          )
        })}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label="Тип"
          value={usageFilter}
          onChange={(e) => setUsageFilter(e.target.value as PhraseUsage | 'all')}
          sx={{ width: 200 }}
        >
          <MenuItem value="all">образцы и блоки</MenuItem>
          <MenuItem value="example">только образцы</MenuItem>
          <MenuItem value="block">только блоки</MenuItem>
        </TextField>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() =>
            setEditing({
              id: null,
              value: {
                ...EMPTY,
                kind: kindFilter === 'all' ? 'greeting' : kindFilter,
                usage: kindFilter !== 'all' && PHRASE_KIND_META[kindFilter].blockByDefault ? 'block' : 'example',
              },
            })
          }
        >
          Добавить
        </Button>
      </Stack>

      {isLoading && <Skeleton variant="rounded" height={200} sx={{ borderRadius: 3 }} />}
      {!isLoading && visible.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          Здесь пусто. Загрузите стандартную библиотеку или добавьте текст.
        </Typography>
      )}
      {visible.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Вид</TableCell>
              <TableCell>Название и текст</TableCell>
              <TableCell>Для кого</TableCell>
              <TableCell align="right">Отклик</TableCell>
              <TableCell align="center">Вкл.</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id} hover sx={{ opacity: row.enabled ? 1 : 0.55 }}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Stack spacing={0.5}>
                    <Chip size="small" label={PHRASE_KIND_META[row.kind].label} />
                    <Chip
                      size="small"
                      variant="outlined"
                      color={row.usage === 'block' ? 'secondary' : 'default'}
                      label={row.usage === 'block' ? 'блок · дословно' : 'образец'}
                    />
                  </Stack>
                </TableCell>
                <TableCell sx={{ maxWidth: 520 }}>
                  {row.title && <Typography sx={{ fontWeight: 600, fontSize: 13 }}>{row.title}</Typography>}
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: 'text.secondary',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {row.text}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {row.text.length} симв. · {SOURCE_LABELS[row.source] ?? row.source}
                    {row.conditions.requiresRequest === false && ' · когда запрос неизвестен'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                  {row.gender ? GENDER_LABELS[row.gender] : 'всем'}
                  {row.categoryKey && <div>{row.categoryKey}</div>}
                  {row.language !== 'ru' && <div>{row.language}</div>}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {row.sentCount > 0 ? `${row.repliedCount}/${row.sentCount}` : '—'}
                </TableCell>
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
                      if (window.confirm('Удалить текст?')) void remove({ accountId, id: row.id })
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
        <PhraseDialog accountId={accountId} id={editing.id} initial={editing.value} onClose={() => setEditing(null)} />
      )}
    </Stack>
  )
}

function toInput(row: PhraseDto): PhraseInput {
  return {
    usage: row.usage,
    kind: row.kind,
    categoryKey: row.categoryKey,
    gender: row.gender,
    language: row.language,
    title: row.title,
    text: row.text,
    conditions: row.conditions,
    enabled: row.enabled,
    weight: row.weight,
    sortOrder: row.sortOrder,
  }
}

function PhraseDialog({
  accountId,
  id,
  initial,
  onClose,
}: {
  accountId: string
  id: string | null
  initial: PhraseInput
  onClose: () => void
}) {
  const [form, setForm] = useState(initial)
  const { data: categories } = useGetCategoriesQuery(accountId)
  const [create, { isLoading: creating, error: createError }] = useCreatePhraseMutation()
  const [update, { isLoading: updating, error: updateError }] = useUpdatePhraseMutation()
  const error = createError ?? updateError

  const submit = async () => {
    const result = id ? await update({ accountId, id, patch: form }) : await create({ accountId, body: form })
    if (!('error' in result)) onClose()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{id ? 'Редактировать текст' : 'Новый текст'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              select
              size="small"
              fullWidth
              label="Вид"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as PhraseKind })}
            >
              {PHRASE_KINDS.map((kind) => (
                <MenuItem key={kind} value={kind}>
                  {PHRASE_KIND_META[kind].label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              fullWidth
              label="Как использовать"
              value={form.usage}
              onChange={(e) => setForm({ ...form, usage: e.target.value as PhraseUsage })}
              helperText={
                form.usage === 'block'
                  ? 'Блок уходит клиенту дословно; сообщения разделяйте строкой ---'
                  : 'Образец тона: модель перефразирует под контекст'
              }
            >
              <MenuItem value="example">образец</MenuItem>
              <MenuItem value="block">блок (дословно)</MenuItem>
            </TextField>
          </Stack>
          <TextField
            size="small"
            fullWidth
            label="Название (для себя)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={5}
            label="Текст"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
          {form.usage === 'block' && <SplitPreview accountId={accountId} text={form.text} />}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              select
              size="small"
              fullWidth
              label="Категория запроса"
              value={form.categoryKey ?? ''}
              onChange={(e) => setForm({ ...form, categoryKey: e.target.value || null })}
            >
              <MenuItem value="">любая</MenuItem>
              {(categories ?? []).map((c) => (
                <MenuItem key={c.key} value={c.key}>
                  {c.title}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              fullWidth
              label="Пол клиента"
              value={form.gender ?? ''}
              onChange={(e) => setForm({ ...form, gender: (e.target.value || null) as Gender | null })}
            >
              <MenuItem value="">любой</MenuItem>
              <MenuItem value="f">женщинам</MenuItem>
              <MenuItem value="m">мужчинам</MenuItem>
            </TextField>
            <TextField
              size="small"
              label="Язык"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              sx={{ width: 120 }}
            />
            <TextField
              size="small"
              type="number"
              label="Вес"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
              sx={{ width: 100 }}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={<Switch size="small" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />}
              label="Включён"
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={form.conditions.requiresRequest === false}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      conditions: e.target.checked ? { ...form.conditions, requiresRequest: false } : { ...form.conditions, requiresRequest: undefined },
                    })
                  }
                />
              }
              label="Только когда запрос клиента неизвестен"
            />
          </Stack>
          {error && <Alert severity="error">{getApiErrorMessage(error, 'Не удалось сохранить')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" loading={creating || updating} disabled={!form.text.trim()} onClick={() => void submit()}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}
