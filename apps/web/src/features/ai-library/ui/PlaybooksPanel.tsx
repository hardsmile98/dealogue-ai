import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { getApiErrorMessage } from '@/shared/lib'
import { PHRASE_KINDS } from '@/shared/api'
import type { PhraseKind, PlaybookDto } from '@/shared/api'
import { FUNNEL_STAGE_META } from '@/entities/ai-agent'
import {
  PHRASE_KIND_META,
  useGetPlaybooksQuery,
  useResetPlaybooksMutation,
  useUpdatePlaybookMutation,
} from '@/entities/ai-library'

interface PlaybooksPanelProps {
  accountId: string
}

/** Плейбуки этапов: цель, инструкции для модели, блоки и образцы. */
export function PlaybooksPanel({ accountId }: PlaybooksPanelProps) {
  const { data, isLoading, error } = useGetPlaybooksQuery(accountId)
  const [resetAll, { isLoading: resetting }] = useResetPlaybooksMutation()

  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить плейбуки')}</Alert>
  if (isLoading || !data) {
    return (
      <Stack spacing={1.5}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 3 }} />
        ))}
      </Stack>
    )
  }

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          Плейбук говорит модели, чего добиваться на этапе, что обязательно вставить дословно и на какие образцы
          опираться. Формулируйте как инструкцию человеку.
        </Typography>
        <Button
          size="small"
          startIcon={<RestartAltIcon />}
          loading={resetting}
          onClick={() => {
            if (window.confirm('Вернуть все плейбуки к значениям по умолчанию? Ваши правки будут потеряны.')) {
              void resetAll({ accountId })
            }
          }}
        >
          Все по умолчанию
        </Button>
      </Stack>
      {data.map((playbook) => (
        <PlaybookCard key={`${playbook.stage}:${playbook.updatedAt}`} accountId={accountId} playbook={playbook} />
      ))}
    </Stack>
  )
}

function PlaybookCard({ accountId, playbook }: { accountId: string; playbook: PlaybookDto }) {
  const [form, setForm] = useState(playbook)
  const [update, { isLoading: saving, error }] = useUpdatePlaybookMutation()
  const [reset, { isLoading: resetting }] = useResetPlaybooksMutation()
  const dirty = JSON.stringify(form) !== JSON.stringify(playbook)
  const meta = FUNNEL_STAGE_META[playbook.stage]

  const kindSelect = (
    label: string,
    key: 'requiredBlockKinds' | 'allowedBlockKinds' | 'exampleKinds',
    onlyBlocks: boolean,
  ) => (
    <TextField
      select
      size="small"
      fullWidth
      label={label}
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value as unknown as PhraseKind[] })}
      slotProps={{
        select: {
          multiple: true,
          renderValue: (selected) => (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {(selected as PhraseKind[]).map((kind) => (
                <Chip key={kind} size="small" label={PHRASE_KIND_META[kind].label} />
              ))}
            </Stack>
          ),
        },
      }}
    >
      {PHRASE_KINDS.filter((kind) => !onlyBlocks || PHRASE_KIND_META[kind].blockByDefault).map((kind) => (
        <MenuItem key={kind} value={kind}>
          {PHRASE_KIND_META[kind].label}
        </MenuItem>
      ))}
    </TextField>
  )

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, opacity: form.enabled ? 1 : 0.7 }}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
          <Typography sx={{ fontWeight: 700 }}>{meta.label}</Typography>
          <Chip size="small" variant="outlined" label={playbook.stage} />
          <Box sx={{ flexGrow: 1 }} />
          <FormControlLabel
            control={<Switch size="small" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />}
            label="включён"
          />
        </Stack>
        <Stack spacing={1.5}>
          <TextField
            size="small"
            fullWidth
            label="Цель этапа"
            value={form.goal}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
          />
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={3}
            label="Инструкции для модели"
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            {kindSelect('Обязательные блоки (дословно)', 'requiredBlockKinds', true)}
            {kindSelect('Разрешённые блоки', 'allowedBlockKinds', true)}
            {kindSelect('Образцы для тона', 'exampleKinds', false)}
          </Stack>
          <FormControlLabel
            control={
              <Switch size="small" checked={form.noQuestions} onChange={(e) => setForm({ ...form, noQuestions: e.target.checked })} />
            }
            label="На этом этапе не задавать вопросов"
          />
          {error && <Alert severity="error">{getApiErrorMessage(error, 'Не удалось сохранить')}</Alert>}
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="contained"
              disabled={!dirty}
              loading={saving}
              onClick={() => {
                const { id: _id, stage: _stage, updatedAt: _updatedAt, ...patch } = form
                void update({ accountId, stage: playbook.stage, patch })
              }}
            >
              Сохранить
            </Button>
            <Button size="small" disabled={!dirty} onClick={() => setForm(playbook)}>
              Отменить
            </Button>
            <Button
              size="small"
              color="inherit"
              loading={resetting}
              onClick={() => void reset({ accountId, stage: playbook.stage })}
            >
              По умолчанию
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
