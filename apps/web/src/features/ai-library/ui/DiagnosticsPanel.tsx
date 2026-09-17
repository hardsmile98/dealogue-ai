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
import type { CategoryDto, DiagnosticDto, DiagnosticInput, Gender } from '@/shared/api'
import {
  CATEGORY_GROUP_LABELS,
  GENDER_LABELS,
  SOURCE_LABELS,
  formatReplyRate,
  isReplaceCandidate,
  useCreateDiagnosticMutation,
  useDeleteDiagnosticMutation,
  useGetCategoriesQuery,
  useGetDiagnosticsQuery,
  useUpdateDiagnosticMutation,
} from '@/entities/ai-library'
import { SplitPreview } from './SplitPreview'

interface DiagnosticsPanelProps {
  accountId: string
}

const EMPTY: DiagnosticInput = {
  key: '',
  title: '',
  categoryKey: null,
  gender: null,
  language: 'ru',
  text: '',
  enabled: true,
  weight: 1,
  sortOrder: 0,
}

type Cell = { f: DiagnosticDto[]; m: DiagnosticDto[]; any: DiagnosticDto[] }

/** Матрица «категория × пол × язык» и список шаблонов диагностик. */
export function DiagnosticsPanel({ accountId }: DiagnosticsPanelProps) {
  const { data, isLoading, error } = useGetDiagnosticsQuery({ accountId })
  const { data: categories } = useGetCategoriesQuery(accountId)
  const [language, setLanguage] = useState('ru')
  const [selectedCategory, setSelectedCategory] = useState<string | 'universal' | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; value: DiagnosticInput } | null>(null)
  const [remove] = useDeleteDiagnosticMutation()
  const [update] = useUpdateDiagnosticMutation()

  const languages = useMemo(() => [...new Set((data ?? []).map((d) => d.language))].sort(), [data])

  const matrix = useMemo(() => {
    const map = new Map<string, Cell>()
    for (const row of data ?? []) {
      if (row.language !== language) continue
      const key = row.categoryKey ?? 'universal'
      const cell = map.get(key) ?? { f: [], m: [], any: [] }
      cell[row.gender ?? 'any'].push(row)
      map.set(key, cell)
    }
    return map
  }, [data, language])

  const rowsForSelected = useMemo(() => {
    if (!selectedCategory) return []
    return (data ?? []).filter((d) => d.language === language && (d.categoryKey ?? 'universal') === selectedCategory)
  }, [data, language, selectedCategory])

  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить диагностики')}</Alert>
  if (isLoading || !data) return <Skeleton variant="rounded" height={260} sx={{ borderRadius: 3 }} />

  const categoryRows: { key: string; title: string; group: string }[] = [
    { key: 'universal', title: 'Универсальная (без категории)', group: 'universal' },
    ...(categories ?? []).map((c) => ({ key: c.key, title: c.title, group: c.groupKey })),
  ]

  const cellChip = (rows: DiagnosticDto[], label: string) => {
    const enabled = rows.filter((r) => r.enabled).length
    if (rows.length === 0) return <Chip size="small" variant="outlined" label="—" sx={{ opacity: 0.4 }} />
    return (
      <Tooltip title={rows.map((r) => r.title).join('\n')}>
        <Chip
          size="small"
          color={enabled > 0 ? 'success' : 'default'}
          variant={enabled > 0 ? 'filled' : 'outlined'}
          label={`${label}: ${enabled}/${rows.length}`}
        />
      </Tooltip>
    )
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          Диагностика уходит клиенту дословно, несколькими сообщениями. Выбор: категория и пол → категория → универсальная
          по полу → универсальная.
        </Typography>
        <TextField select size="small" label="Язык" value={language} onChange={(e) => setLanguage(e.target.value)} sx={{ width: 120 }}>
          {(languages.length > 0 ? languages : ['ru']).map((lang) => (
            <MenuItem key={lang} value={lang}>
              {lang}
            </MenuItem>
          ))}
        </TextField>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ id: null, value: { ...EMPTY, language } })}>
          Добавить
        </Button>
      </Stack>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Категория</TableCell>
            <TableCell>Женщинам</TableCell>
            <TableCell>Мужчинам</TableCell>
            <TableCell>Всем</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {categoryRows.map((category) => {
            const cell = matrix.get(category.key) ?? { f: [], m: [], any: [] }
            const selected = selectedCategory === category.key
            return (
              <TableRow
                key={category.key}
                hover
                selected={selected}
                onClick={() => setSelectedCategory(selected ? null : category.key)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Typography sx={{ fontSize: 13, fontWeight: category.key === 'universal' ? 700 : 500 }}>{category.title}</Typography>
                  <Typography variant="caption" color="text.disabled">
                    {CATEGORY_GROUP_LABELS[category.group] ?? category.group} · {category.key}
                  </Typography>
                </TableCell>
                <TableCell>{cellChip(cell.f, 'ж')}</TableCell>
                <TableCell>{cellChip(cell.m, 'м')}</TableCell>
                <TableCell>{cellChip(cell.any, 'все')}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {selectedCategory && (
        <Box>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>
            Шаблоны: {categoryRows.find((c) => c.key === selectedCategory)?.title}
          </Typography>
          {rowsForSelected.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Для этой категории на языке «{language}» шаблонов нет.
            </Typography>
          )}
          <Stack spacing={1}>
            {rowsForSelected.map((row) => (
              <Stack key={row.id} direction="row" spacing={1} sx={{ alignItems: 'center', opacity: row.enabled ? 1 : 0.55 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{row.title}</Typography>
                  <Typography variant="caption" color="text.disabled">
                    {row.gender ? GENDER_LABELS[row.gender] : 'всем'} · {row.text.length} симв. · {row.messagesCount} сообщ. ·{' '}
                    {SOURCE_LABELS[row.source] ?? row.source}
                    {row.sentCount > 0 && ` · отклик ${formatReplyRate(row)}`}
                    {isReplaceCandidate(row) && ' · отвечают редко, стоит переписать'}
                  </Typography>
                </Box>
                <Switch
                  size="small"
                  checked={row.enabled}
                  onChange={(e) => void update({ accountId, id: row.id, patch: { enabled: e.target.checked } })}
                />
                <IconButton size="small" onClick={() => setEditing({ id: row.id, value: toInput(row) })}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => {
                    if (window.confirm('Удалить шаблон диагностики?')) void remove({ accountId, id: row.id })
                  }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {editing && (
        <DiagnosticDialog
          accountId={accountId}
          id={editing.id}
          initial={editing.value}
          categories={categories ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  )
}

function toInput(row: DiagnosticDto): DiagnosticInput {
  return {
    key: row.key,
    title: row.title,
    categoryKey: row.categoryKey,
    gender: row.gender,
    language: row.language,
    text: row.text,
    enabled: row.enabled,
    weight: row.weight,
    sortOrder: row.sortOrder,
  }
}

function DiagnosticDialog({
  accountId,
  id,
  initial,
  categories,
  onClose,
}: {
  accountId: string
  id: string | null
  initial: DiagnosticInput
  categories: CategoryDto[]
  onClose: () => void
}) {
  const [form, setForm] = useState(initial)
  const [create, { isLoading: creating, error: createError }] = useCreateDiagnosticMutation()
  const [update, { isLoading: updating, error: updateError }] = useUpdateDiagnosticMutation()
  const error = createError ?? updateError

  const submit = async () => {
    const result = id ? await update({ accountId, id, patch: form }) : await create({ accountId, body: form })
    if (!('error' in result)) onClose()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{id ? 'Редактировать диагностику' : 'Новая диагностика'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              size="small"
              fullWidth
              label="Ключ"
              helperText="латиница и точки, уникален в аккаунте"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
            <TextField size="small" fullWidth label="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              select
              size="small"
              fullWidth
              label="Категория"
              value={form.categoryKey ?? ''}
              onChange={(e) => setForm({ ...form, categoryKey: e.target.value || null })}
            >
              <MenuItem value="">универсальная</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.key} value={c.key}>
                  {c.title}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Пол"
              value={form.gender ?? ''}
              onChange={(e) => setForm({ ...form, gender: (e.target.value || null) as Gender | null })}
              sx={{ width: 160 }}
            >
              <MenuItem value="">любой</MenuItem>
              <MenuItem value="f">женщинам</MenuItem>
              <MenuItem value="m">мужчинам</MenuItem>
            </TextField>
            <TextField size="small" label="Язык" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} sx={{ width: 100 }} />
          </Stack>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={10}
            label="Текст диагностики"
            helperText="Уходит дословно. Сообщения разделяйте строкой ---, иначе текст режется по абзацам."
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
          <SplitPreview accountId={accountId} text={form.text} />
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
          disabled={!form.key.trim() || !form.title.trim() || !form.text.trim()}
          onClick={() => void submit()}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}
