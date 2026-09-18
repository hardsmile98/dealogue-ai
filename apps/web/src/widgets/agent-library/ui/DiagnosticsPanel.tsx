import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
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
import { isMutationSuccess } from '@/shared/lib'
import { FormDialog, QueryBoundary } from '@/shared/ui'
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
import { PanelHeader } from './PanelHeader'
import { RowActions } from './RowActions'
import { SplitPreview } from './SplitPreview'
import { agentLibraryStyles as styles } from './AgentLibrary.styles'

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

/** Шаблоны одной клетки матрицы: женщинам, мужчинам, всем. */
interface Cell {
  f: DiagnosticDto[]
  m: DiagnosticDto[]
  any: DiagnosticDto[]
}

const EMPTY_CELL: Cell = { f: [], m: [], any: [] }

/** Матрица «категория × пол × язык» и список шаблонов диагностик. */
export function DiagnosticsPanel({ accountId }: DiagnosticsPanelProps) {
  const query = useGetDiagnosticsQuery({ accountId })
  const { data: categories } = useGetCategoriesQuery({ accountId })
  const [language, setLanguage] = useState('ru')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; value: DiagnosticInput } | null>(null)
  const [remove] = useDeleteDiagnosticMutation()
  const [update] = useUpdateDiagnosticMutation()

  const rows = query.data
  const languages = useMemo(() => [...new Set((rows ?? []).map((row) => row.language))].sort(), [rows])

  const matrix = useMemo(() => {
    const map = new Map<string, Cell>()
    for (const row of rows ?? []) {
      if (row.language !== language) continue
      const key = row.categoryKey ?? 'universal'
      const cell = map.get(key) ?? { f: [], m: [], any: [] }
      cell[row.gender ?? 'any'].push(row)
      map.set(key, cell)
    }
    return map
  }, [rows, language])

  const rowsForSelected = useMemo(() => {
    if (!selectedCategory) return []
    return (rows ?? []).filter(
      (row) => row.language === language && (row.categoryKey ?? 'universal') === selectedCategory,
    )
  }, [rows, language, selectedCategory])

  const categoryRows = [
    { key: 'universal', title: 'Универсальная (без категории)', group: 'universal' },
    ...(categories ?? []).map((category) => ({
      key: category.key,
      title: category.title,
      group: category.groupKey,
    })),
  ]

  return (
    <Stack spacing={2}>
      <PanelHeader hint="Диагностика уходит клиенту дословно, несколькими сообщениями. Выбор: категория и пол → категория → универсальная по полу → универсальная.">
        <TextField
          select
          size="small"
          label="Язык"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          sx={styles.tinySelect}
        >
          {(languages.length > 0 ? languages : ['ru']).map((lang) => (
            <MenuItem key={lang} value={lang}>
              {lang}
            </MenuItem>
          ))}
        </TextField>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setEditing({ id: null, value: { ...EMPTY, language } })}
        >
          Добавить
        </Button>
      </PanelHeader>

      <QueryBoundary query={query} errorText="Не удалось загрузить диагностики" skeleton={260}>
        {() => (
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
                const cell = matrix.get(category.key) ?? EMPTY_CELL
                const selected = selectedCategory === category.key
                return (
                  <TableRow
                    key={category.key}
                    hover
                    selected={selected}
                    onClick={() => setSelectedCategory(selected ? null : category.key)}
                    sx={styles.selectableRow}
                  >
                    <TableCell>
                      <Typography sx={styles.rowTitle}>{category.title}</Typography>
                      <Typography variant="caption" color="text.disabled">
                        {CATEGORY_GROUP_LABELS[category.group] ?? category.group} · {category.key}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <CellChip rows={cell.f} label="ж" />
                    </TableCell>
                    <TableCell>
                      <CellChip rows={cell.m} label="м" />
                    </TableCell>
                    <TableCell>
                      <CellChip rows={cell.any} label="все" />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </QueryBoundary>

      {selectedCategory && (
        <Box>
          <Typography sx={styles.subheading}>
            Шаблоны: {categoryRows.find((category) => category.key === selectedCategory)?.title}
          </Typography>
          {rowsForSelected.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Для этой категории на языке «{language}» шаблонов нет.
            </Typography>
          )}
          <Stack spacing={1}>
            {rowsForSelected.map((row) => (
              <Stack
                key={row.id}
                direction="row"
                spacing={1}
                sx={[styles.itemRow, ...(row.enabled ? [] : [styles.disabledRow])]}
              >
                <Box sx={styles.grow}>
                  <Typography sx={styles.rowTitle}>{row.title}</Typography>
                  <Typography variant="caption" color="text.disabled">
                    {row.gender ? GENDER_LABELS[row.gender] : 'всем'} · {row.text.length} симв. ·{' '}
                    {row.messagesCount} сообщ. · {SOURCE_LABELS[row.source] ?? row.source}
                    {row.sentCount > 0 && ` · отклик ${formatReplyRate(row)}`}
                    {isReplaceCandidate(row) && ' · отвечают редко, стоит переписать'}
                  </Typography>
                </Box>
                <Switch
                  size="small"
                  checked={row.enabled}
                  onChange={(e) => void update({ accountId, id: row.id, patch: { enabled: e.target.checked } })}
                />
                <RowActions
                  onEdit={() => setEditing({ id: row.id, value: toInput(row) })}
                  confirmQuestion="Удалить шаблон диагностики?"
                  onDelete={() => void remove({ accountId, id: row.id })}
                />
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

/** Клетка матрицы: сколько шаблонов и сколько из них включено. */
function CellChip({ rows, label }: { rows: DiagnosticDto[]; label: string }) {
  if (rows.length === 0) {
    return <Chip size="small" variant="outlined" label="—" sx={styles.emptyCellChip} />
  }
  const enabled = rows.filter((row) => row.enabled).length
  return (
    <Tooltip title={rows.map((row) => row.title).join('\n')}>
      <Chip
        size="small"
        color={enabled > 0 ? 'success' : 'default'}
        variant={enabled > 0 ? 'filled' : 'outlined'}
        label={`${label}: ${enabled}/${rows.length}`}
      />
    </Tooltip>
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

interface DiagnosticDialogProps {
  accountId: string
  id: string | null
  initial: DiagnosticInput
  categories: CategoryDto[]
  onClose: () => void
}

function DiagnosticDialog({ accountId, id, initial, categories, onClose }: DiagnosticDialogProps) {
  const [form, setForm] = useState(initial)
  const [create, { isLoading: creating, error: createError }] = useCreateDiagnosticMutation()
  const [update, { isLoading: updating, error: updateError }] = useUpdateDiagnosticMutation()

  const submit = async () => {
    const result = id ? await update({ accountId, id, patch: form }) : await create({ accountId, body: form })
    if (isMutationSuccess(result)) onClose()
  }

  return (
    <FormDialog
      open
      maxWidth="md"
      title={id ? 'Редактировать диагностику' : 'Новая диагностика'}
      onClose={onClose}
      onSubmit={() => void submit()}
      error={createError ?? updateError}
      submitting={creating || updating}
      submitDisabled={!form.key.trim() || !form.title.trim() || !form.text.trim()}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          size="small"
          fullWidth
          label="Ключ"
          helperText="латиница и точки, уникален в аккаунте"
          value={form.key}
          onChange={(e) => setForm({ ...form, key: e.target.value })}
        />
        <TextField
          size="small"
          fullWidth
          label="Название"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
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
          {categories.map((category) => (
            <MenuItem key={category.key} value={category.key}>
              {category.title}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Пол"
          value={form.gender ?? ''}
          onChange={(e) => setForm({ ...form, gender: (e.target.value || null) as Gender | null })}
          sx={styles.tinySelect}
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
          sx={styles.tinySelect}
        />
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
        control={
          <Switch
            size="small"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
        }
        label="Включена"
      />
    </FormDialog>
  )
}
