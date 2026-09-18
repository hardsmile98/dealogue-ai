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
import { FACT_GROUPS } from '@/shared/api'
import type { FactDto, FactGroup, FactInput } from '@/shared/api'
import {
  FACT_GROUP_LABELS,
  useCreateFactMutation,
  useDeleteFactMutation,
  useGetFactsQuery,
  useUpdateFactMutation,
} from '@/entities/ai-library'
import { PanelHeader } from './PanelHeader'
import { RowActions } from './RowActions'
import { agentLibraryStyles as styles } from './AgentLibrary.styles'

interface FactsPanelProps {
  accountId: string
}

const EMPTY: FactInput = { group: 'service', key: '', title: '', value: '', enabled: true, sortOrder: 0 }

/** Факты об услугах и персоне — единственный источник цен, ссылок и сроков для бота. */
export function FactsPanel({ accountId }: FactsPanelProps) {
  const query = useGetFactsQuery({ accountId })
  const [editing, setEditing] = useState<{ id: string | null; value: FactInput } | null>(null)
  const [remove] = useDeleteFactMutation()
  const [update] = useUpdateFactMutation()

  return (
    <Stack spacing={1.5}>
      <PanelHeader hint="Бот называет только те цены, ссылки и сроки, что записаны здесь. Всё остальное он говорить не имеет права — проверка отклонит ответ.">
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
        errorText="Не удалось загрузить факты"
        skeleton={200}
        empty="Фактов пока нет."
      >
        {(facts) => (
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
              {facts.map((row) => (
                <TableRow key={row.id} hover sx={row.enabled ? undefined : styles.disabledRow}>
                  <TableCell sx={styles.nowrapCell}>
                    <Chip size="small" label={FACT_GROUP_LABELS[row.group]} />
                  </TableCell>
                  <TableCell sx={styles.nowrapCell}>
                    <Typography sx={styles.rowTitle}>{row.title}</Typography>
                    <Typography variant="caption" color="text.disabled">
                      {row.key}
                    </Typography>
                  </TableCell>
                  <TableCell sx={styles.textCell}>{row.value}</TableCell>
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
                      confirmQuestion="Удалить факт?"
                      confirmDescription="Бот перестанет называть эти данные клиентам."
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
        <FactDialog
          accountId={accountId}
          id={editing.id}
          initial={editing.value}
          onClose={() => setEditing(null)}
        />
      )}
    </Stack>
  )
}

function toInput(row: FactDto): FactInput {
  return {
    group: row.group,
    key: row.key,
    title: row.title,
    value: row.value,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
  }
}

interface FactDialogProps {
  accountId: string
  id: string | null
  initial: FactInput
  onClose: () => void
}

function FactDialog({ accountId, id, initial, onClose }: FactDialogProps) {
  const [form, setForm] = useState(initial)
  const [create, { isLoading: creating, error: createError }] = useCreateFactMutation()
  const [update, { isLoading: updating, error: updateError }] = useUpdateFactMutation()

  const submit = async () => {
    const result = id ? await update({ accountId, id, patch: form }) : await create({ accountId, body: form })
    if (isMutationSuccess(result)) onClose()
  }

  return (
    <FormDialog
      open
      title={id ? 'Редактировать факт' : 'Новый факт'}
      onClose={onClose}
      onSubmit={() => void submit()}
      error={createError ?? updateError}
      submitting={creating || updating}
      submitDisabled={!form.key.trim() || !form.title.trim() || !form.value.trim()}
    >
      <Stack direction="row" spacing={1.5}>
        <TextField
          select
          size="small"
          label="Группа"
          value={form.group}
          onChange={(e) => setForm({ ...form, group: e.target.value as FactGroup })}
          sx={styles.dialogSelect}
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
        minRows={3}
        label="Значение"
        helperText="Как есть, так и будет сказано клиенту: цифры, сроки, ссылки."
        value={form.value}
        onChange={(e) => setForm({ ...form, value: e.target.value })}
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
        }
        label="Включён"
      />
    </FormDialog>
  )
}
