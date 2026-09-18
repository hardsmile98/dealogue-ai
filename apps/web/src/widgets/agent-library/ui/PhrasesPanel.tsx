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
import { PHRASE_KINDS } from '@/shared/api'
import type { Gender, PhraseDto, PhraseInput, PhraseKind, PhraseUsage } from '@/shared/api'
import {
  GENDER_LABELS,
  PHRASE_KIND_META,
  REPLY_LOW_RATE,
  SOURCE_LABELS,
  formatReplyRate,
  isReplaceCandidate,
  useCreatePhraseMutation,
  useDeletePhraseMutation,
  useGetCategoriesQuery,
  useGetPhrasesQuery,
  useUpdatePhraseMutation,
} from '@/entities/ai-library'
import { RowActions } from './RowActions'
import { SplitPreview } from './SplitPreview'
import { agentLibraryStyles as styles } from './AgentLibrary.styles'

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
  const query = useGetPhrasesQuery({ accountId })
  const [kindFilter, setKindFilter] = useState<PhraseKind | 'all'>('all')
  const [usageFilter, setUsageFilter] = useState<PhraseUsage | 'all'>('all')
  const [editing, setEditing] = useState<{ id: string | null; value: PhraseInput } | null>(null)
  const [remove] = useDeletePhraseMutation()
  const [update] = useUpdatePhraseMutation()

  const rows = query.data
  const visible = useMemo(
    () =>
      (rows ?? []).filter(
        (row) =>
          (kindFilter === 'all' || row.kind === kindFilter) &&
          (usageFilter === 'all' || row.usage === usageFilter),
      ),
    [rows, kindFilter, usageFilter],
  )
  const countsByKind = useMemo(() => {
    const counts = new Map<PhraseKind, { total: number; enabled: number }>()
    for (const row of rows ?? []) {
      const entry = counts.get(row.kind) ?? { total: 0, enabled: 0 }
      entry.total += 1
      if (row.enabled) entry.enabled += 1
      counts.set(row.kind, entry)
    }
    return counts
  }, [rows])

  const addPhrase = () =>
    setEditing({
      id: null,
      value: {
        ...EMPTY,
        kind: kindFilter === 'all' ? 'greeting' : kindFilter,
        usage: kindFilter !== 'all' && PHRASE_KIND_META[kindFilter].blockByDefault ? 'block' : 'example',
      },
    })

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={styles.filterChips}>
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

      <Stack direction="row" spacing={1} sx={styles.filterRow}>
        <TextField
          select
          size="small"
          label="Тип"
          value={usageFilter}
          onChange={(e) => setUsageFilter(e.target.value as PhraseUsage | 'all')}
          sx={styles.narrowSelect}
        >
          <MenuItem value="all">образцы и блоки</MenuItem>
          <MenuItem value="example">только образцы</MenuItem>
          <MenuItem value="block">только блоки</MenuItem>
        </TextField>
        <Box sx={styles.spacer} />
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={addPhrase}>
          Добавить
        </Button>
      </Stack>

      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить библиотеку"
        skeleton={200}
        empty="Здесь пусто. Загрузите стандартную библиотеку или добавьте текст."
        // Фильтры сужают выдачу уже на клиенте, поэтому «пусто» решает не ответ,
        // а то, что осталось после фильтров.
        isEmpty={() => visible.length === 0}
      >
        {() => (
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
                <TableRow key={row.id} hover sx={row.enabled ? undefined : styles.disabledRow}>
                  <TableCell sx={styles.nowrapCell}>
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
                  <TableCell sx={styles.phraseCell}>
                    {row.title && <Typography sx={styles.rowTitle}>{row.title}</Typography>}
                    <Typography sx={styles.phraseText}>{row.text}</Typography>
                    <Typography variant="caption" color="text.disabled">
                      {row.text.length} симв. · {SOURCE_LABELS[row.source] ?? row.source}
                      {row.conditions.requiresRequest === false && ' · когда запрос неизвестен'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={styles.audienceCell}>
                    {row.gender ? GENDER_LABELS[row.gender] : 'всем'}
                    {row.categoryKey && <div>{row.categoryKey}</div>}
                    {row.language !== 'ru' && <div>{row.language}</div>}
                  </TableCell>
                  <TableCell align="right" sx={styles.replyCell}>
                    <Tooltip
                      title={`Клиент отвечал в течение суток после ${row.sentCount} отправок`}
                      disableHoverListener={row.sentCount === 0}
                    >
                      <span>{formatReplyRate(row)}</span>
                    </Tooltip>
                    {isReplaceCandidate(row) && (
                      <Tooltip
                        title={`Отвечают меньше чем на ${Math.round(REPLY_LOW_RATE * 100)} % отправок — текст стоит переписать`}
                      >
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label="переписать"
                          sx={styles.replyBadge}
                        />
                      </Tooltip>
                    )}
                  </TableCell>
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
                      confirmQuestion="Удалить текст?"
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
        <PhraseDialog
          accountId={accountId}
          id={editing.id}
          initial={editing.value}
          onClose={() => setEditing(null)}
        />
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

interface PhraseDialogProps {
  accountId: string
  id: string | null
  initial: PhraseInput
  onClose: () => void
}

function PhraseDialog({ accountId, id, initial, onClose }: PhraseDialogProps) {
  const [form, setForm] = useState(initial)
  const { data: categories } = useGetCategoriesQuery({ accountId })
  const [create, { isLoading: creating, error: createError }] = useCreatePhraseMutation()
  const [update, { isLoading: updating, error: updateError }] = useUpdatePhraseMutation()

  const submit = async () => {
    const result = id ? await update({ accountId, id, patch: form }) : await create({ accountId, body: form })
    if (isMutationSuccess(result)) onClose()
  }

  return (
    <FormDialog
      open
      maxWidth="md"
      title={id ? 'Редактировать текст' : 'Новый текст'}
      onClose={onClose}
      onSubmit={() => void submit()}
      error={createError ?? updateError}
      submitting={creating || updating}
      submitDisabled={!form.text.trim()}
    >
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
          {(categories ?? []).map((category) => (
            <MenuItem key={category.key} value={category.key}>
              {category.title}
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
          sx={styles.tinySelect}
        />
        <TextField
          size="small"
          type="number"
          label="Вес"
          value={form.weight}
          onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
          sx={styles.tinySelect}
        />
      </Stack>
      <Stack direction="row" spacing={2}>
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
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={form.conditions.requiresRequest === false}
              onChange={(e) =>
                setForm({
                  ...form,
                  conditions: {
                    ...form.conditions,
                    requiresRequest: e.target.checked ? false : undefined,
                  },
                })
              }
            />
          }
          label="Только когда запрос клиента неизвестен"
        />
      </Stack>
    </FormDialog>
  )
}
