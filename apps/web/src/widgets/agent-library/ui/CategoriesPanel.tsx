import { useState } from 'react'
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
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import { isMutationSuccess } from '@/shared/lib'
import { FormDialog, QueryBoundary } from '@/shared/ui'
import type { CategoryDto, CategoryInput } from '@/shared/api'
import {
  CATEGORY_GROUP_LABELS,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
  useUpdateCategoryMutation,
} from '@/entities/ai-library'
import { PanelHeader } from './PanelHeader'
import { RowActions } from './RowActions'
import { agentLibraryStyles as styles } from './AgentLibrary.styles'

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
  const query = useGetCategoriesQuery({ accountId })
  const [editing, setEditing] = useState<{ id: string | null; value: CategoryInput } | null>(null)
  const [remove] = useDeleteCategoryMutation()
  const [update] = useUpdateCategoryMutation()

  return (
    <Stack spacing={1.5}>
      <PanelHeader hint="Описание категории читает модель, когда решает, о чём запрос клиента. Уточняющий вопрос задаётся, если без него не выбрать диагностику.">
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setEditing({ id: null, value: EMPTY })}
        >
          Добавить
        </Button>
      </PanelHeader>

      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить категории"
        skeleton={200}
        empty="Категорий пока нет."
      >
        {(categories) => (
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
              {categories.map((row) => (
                <TableRow key={row.id} hover sx={row.enabled ? undefined : styles.disabledRow}>
                  <TableCell sx={styles.nowrapCell}>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={CATEGORY_GROUP_LABELS[row.groupKey] ?? row.groupKey}
                    />
                  </TableCell>
                  <TableCell sx={styles.nowrapCell}>
                    <Typography sx={styles.rowTitle}>{row.title}</Typography>
                    <Typography variant="caption" color="text.disabled">
                      {row.key}
                    </Typography>
                  </TableCell>
                  <TableCell sx={styles.categoryCell}>{row.description}</TableCell>
                  <TableCell sx={styles.clarifyCell}>{row.clarifyingQuestion ?? '—'}</TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      checked={row.enabled}
                      onChange={(e) => void update({ accountId, id: row.id, patch: { enabled: e.target.checked } })}
                    />
                  </TableCell>
                  <TableCell align="right" sx={styles.nowrapCell}>
                    <RowActions
                      onEdit={() => setEditing({ id: row.id, value: toInput(row) })}
                      confirmQuestion="Удалить категорию?"
                      confirmDescription="Диагностики с этой категорией останутся, но перестанут выбираться."
                      onDelete={() => void remove({ accountId, id: row.id })}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </QueryBoundary>

      {editing && (
        <CategoryDialog
          accountId={accountId}
          id={editing.id}
          initial={editing.value}
          onClose={() => setEditing(null)}
        />
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

interface CategoryDialogProps {
  accountId: string
  id: string | null
  initial: CategoryInput
  onClose: () => void
}

function CategoryDialog({ accountId, id, initial, onClose }: CategoryDialogProps) {
  const [form, setForm] = useState(initial)
  const [create, { isLoading: creating, error: createError }] = useCreateCategoryMutation()
  const [update, { isLoading: updating, error: updateError }] = useUpdateCategoryMutation()

  const submit = async () => {
    // Ключ уточняющего факта нужен только вместе с самим вопросом.
    const body: CategoryInput = {
      ...form,
      clarifyingFactKey: form.clarifyingQuestion?.trim() ? form.clarifyingFactKey || 'clarify' : null,
      clarifyingQuestion: form.clarifyingQuestion?.trim() || null,
    }
    const result = id ? await update({ accountId, id, patch: body }) : await create({ accountId, body })
    if (isMutationSuccess(result)) onClose()
  }

  return (
    <FormDialog
      open
      title={id ? 'Редактировать категорию' : 'Новая категория'}
      onClose={onClose}
      onSubmit={() => void submit()}
      error={createError ?? updateError}
      submitting={creating || updating}
      submitDisabled={!form.key.trim() || !form.title.trim()}
    >
      <Stack direction="row" spacing={1.5}>
        <TextField
          select
          size="small"
          label="Группа"
          value={form.groupKey}
          onChange={(e) => setForm({ ...form, groupKey: e.target.value })}
          sx={styles.dialogSelect}
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
      <TextField
        size="small"
        fullWidth
        label="Название"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
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
