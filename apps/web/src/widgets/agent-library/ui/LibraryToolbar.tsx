import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloudDownloadOutlinedIcon from '@mui/icons-material/CloudDownloadOutlined'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import { formatRelative, getApiErrorMessage } from '@/shared/lib'
import { FormDialog } from '@/shared/ui'
import type { CopyLibraryRequest, SeedResultDto } from '@/shared/api'
import {
  PHRASE_KIND_META,
  useCopyLibraryMutation,
  useGetLibraryOverviewQuery,
  useSeedLibraryMutation,
} from '@/entities/ai-library'
import { FUNNEL_STAGE_META } from '@/entities/ai-agent'
import { useGetAccountsQuery } from '@/entities/telegram-account'
import { agentLibraryStyles as styles } from './AgentLibrary.styles'

interface LibraryToolbarProps {
  accountId: string
}

/** Итог загрузки или копирования: «phrases: +12 / ~3 / =40». */
function describeResult(result: SeedResultDto): string {
  return Object.entries(result)
    .filter((entry): entry is [string, NonNullable<SeedResultDto['notes']>] => Boolean(entry[1]))
    .map(([key, stats]) => `${key}: +${stats.created} / ~${stats.updated} / =${stats.skipped}`)
    .join(' · ')
}

const COPY_SECTIONS: { key: keyof Omit<CopyLibraryRequest, 'mode'>; label: string }[] = [
  { key: 'categories', label: 'Категории' },
  { key: 'phrases', label: 'Образцы и блоки' },
  { key: 'facts', label: 'Факты' },
  { key: 'diagnostics', label: 'Диагностики' },
  { key: 'playbooks', label: 'Плейбуки' },
  { key: 'notes', label: 'Заметки' },
]

/** Сводка полноты библиотеки, загрузка стандартного набора и копирование из другого аккаунта. */
export function LibraryToolbar({ accountId }: LibraryToolbarProps) {
  const { data: overview } = useGetLibraryOverviewQuery(accountId)
  const [seed, { isLoading: seeding, data: seedResult, error: seedError }] = useSeedLibraryMutation()
  const [copyOpen, setCopyOpen] = useState(false)

  const missing = [...(overview?.missingBlocks ?? []), ...(overview?.missingExamples ?? [])]

  return (
    <Stack spacing={1.5} sx={styles.toolbar}>
      <Stack direction="row" spacing={1} sx={styles.toolbarRow}>
        {overview && (
          <>
            <Chip size="small" variant="outlined" label={`образцов: ${overview.counts.phrases}`} />
            <Chip size="small" variant="outlined" label={`блоков: ${overview.counts.blocks}`} />
            <Chip size="small" variant="outlined" label={`фактов: ${overview.counts.facts}`} />
            <Chip size="small" variant="outlined" label={`диагностик: ${overview.counts.diagnostics}`} />
            <Chip size="small" variant="outlined" label={`категорий: ${overview.counts.categories}`} />
          </>
        )}
        <Stack direction="row" spacing={1} sx={styles.toolbarActions}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<CloudDownloadOutlinedIcon />}
            loading={seeding}
            onClick={() => void seed({ accountId, mode: 'skip' })}
          >
            {overview?.seededAt ? 'Дозагрузить стандартную' : 'Загрузить стандартную библиотеку'}
          </Button>
          <Button size="small" variant="text" startIcon={<ContentCopyOutlinedIcon />} onClick={() => setCopyOpen(true)}>
            Скопировать из аккаунта
          </Button>
        </Stack>
      </Stack>

      {overview?.seededAt && (
        <Typography variant="caption" color="text.secondary">
          Стандартная библиотека загружена {formatRelative(overview.seededAt)}. Повторная загрузка добавляет только
          недостающее и не трогает ваши правки.
        </Typography>
      )}
      {seedResult && <Alert severity="success">Загружено. {describeResult(seedResult)}</Alert>}
      {seedError && <Alert severity="error">{getApiErrorMessage(seedError, 'Не удалось загрузить библиотеку')}</Alert>}

      {missing.length > 0 && (
        <Alert severity="warning">
          Не хватает включённых текстов:{' '}
          {missing
            .map((item) => `${PHRASE_KIND_META[item.kind].label} (${FUNNEL_STAGE_META[item.stage].label})`)
            .join(', ')}
          . Без блоков соответствующий шаг воронки будет пропущен.
        </Alert>
      )}

      <CopyDialog accountId={accountId} open={copyOpen} onClose={() => setCopyOpen(false)} />
    </Stack>
  )
}

function CopyDialog({ accountId, open, onClose }: { accountId: string; open: boolean; onClose: () => void }) {
  const { data: accounts } = useGetAccountsQuery(undefined, { skip: !open })
  const [copy, { isLoading, data, error, reset }] = useCopyLibraryMutation()
  const [source, setSource] = useState('')
  const [body, setBody] = useState<CopyLibraryRequest>({
    categories: true,
    phrases: true,
    facts: true,
    diagnostics: true,
    playbooks: true,
    notes: false,
    mode: 'skip',
  })

  const others = (accounts ?? []).filter((account) => account.id !== accountId)

  const close = () => {
    reset()
    onClose()
  }

  return (
    <FormDialog
      open={open}
      title="Скопировать библиотеку из другого аккаунта"
      onClose={close}
      onSubmit={() => void copy({ accountId, sourceAccountId: source, body })}
      error={error}
      errorText="Не удалось скопировать"
      submitting={isLoading}
      submitDisabled={!source}
      submitLabel="Скопировать"
      cancelLabel="Закрыть"
    >
      <TextField
        select
        size="small"
        label="Аккаунт-источник"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      >
        {others.length === 0 && <MenuItem disabled>Других аккаунтов нет</MenuItem>}
        {others.map((account) => (
          <MenuItem key={account.id} value={account.id}>
            {account.displayName} · {account.phone}
          </MenuItem>
        ))}
      </TextField>
      <Stack direction="row" sx={styles.copyOptions}>
        {COPY_SECTIONS.map((section) => (
          <FormControlLabel
            key={section.key}
            control={
              <Checkbox
                size="small"
                checked={body[section.key]}
                onChange={(e) => setBody({ ...body, [section.key]: e.target.checked })}
              />
            }
            label={section.label}
          />
        ))}
      </Stack>
      <TextField
        select
        size="small"
        label="Если запись с таким ключом уже есть"
        value={body.mode}
        onChange={(e) => setBody({ ...body, mode: e.target.value as 'skip' | 'replace' })}
      >
        <MenuItem value="skip">пропустить (оставить мою)</MenuItem>
        <MenuItem value="replace">заменить текстом источника</MenuItem>
      </TextField>
      {data && <Alert severity="success">Скопировано. {describeResult(data)}</Alert>}
    </FormDialog>
  )
}
