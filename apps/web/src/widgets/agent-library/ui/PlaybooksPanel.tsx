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
import { ConfirmAction, QueryBoundary } from '@/shared/ui'
import { PHRASE_KINDS } from '@/shared/api'
import type { PhraseKind, PlaybookDto } from '@/shared/api'
import { FUNNEL_STAGE_META } from '@/entities/ai-agent'
import {
  PHRASE_KIND_META,
  useGetPlaybooksQuery,
  useResetPlaybooksMutation,
  useUpdatePlaybookMutation,
} from '@/entities/ai-library'
import { PanelHeader } from './PanelHeader'
import { agentLibraryStyles as styles } from './AgentLibrary.styles'

interface PlaybooksPanelProps {
  accountId: string
}

/** Плейбуки этапов: цель, инструкции для модели, блоки и образцы. */
export function PlaybooksPanel({ accountId }: PlaybooksPanelProps) {
  const query = useGetPlaybooksQuery(accountId)
  const [resetAll, { isLoading: resetting }] = useResetPlaybooksMutation()

  return (
    <Stack spacing={1.5}>
      <PanelHeader hint="Плейбук говорит модели, чего добиваться на этапе, что обязательно вставить дословно и на какие образцы опираться. Формулируйте как инструкцию человеку.">
        <ConfirmAction
          question="Вернуть все плейбуки к значениям по умолчанию?"
          description="Ваши правки будут потеряны."
          confirmLabel="Вернуть"
          destructive
          onConfirm={() => void resetAll({ accountId })}
        >
          {(ask) => (
            <Button size="small" startIcon={<RestartAltIcon />} loading={resetting} onClick={ask}>
              Все по умолчанию
            </Button>
          )}
        </ConfirmAction>
      </PanelHeader>

      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить плейбуки"
        skeleton={
          <Stack spacing={1.5}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} variant="rounded" height={120} />
            ))}
          </Stack>
        }
      >
        {(playbooks) => (
          <Stack spacing={1.5}>
            {playbooks.map((playbook) => (
              // Ключ включает updatedAt: после сохранения карточка пересоздаётся
              // из свежих данных, а не держит устаревшую копию формы.
              <PlaybookCard
                key={`${playbook.stage}:${playbook.updatedAt}`}
                accountId={accountId}
                playbook={playbook}
              />
            ))}
          </Stack>
        )}
      </QueryBoundary>
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
            <Stack direction="row" spacing={0.5} sx={styles.filterChips}>
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
    <Card variant="outlined" sx={form.enabled ? undefined : styles.disabledRow}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={styles.playbookHeader}>
          <Typography sx={styles.subheading}>{meta.label}</Typography>
          <Chip size="small" variant="outlined" label={playbook.stage} />
          <Box sx={styles.spacer} />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
            }
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
              <Switch
                size="small"
                checked={form.noQuestions}
                onChange={(e) => setForm({ ...form, noQuestions: e.target.checked })}
              />
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
                // Серверные поля обратно не отправляем: они не редактируются.
                const { id: _id, stage: _stage, updatedAt: _updatedAt, ...patch } = form
                void update({ accountId, stage: playbook.stage, patch })
              }}
            >
              Сохранить
            </Button>
            <Button size="small" disabled={!dirty} onClick={() => setForm(playbook)}>
              Отменить
            </Button>
            <ConfirmAction
              question={`Вернуть плейбук «${meta.label}» к значениям по умолчанию?`}
              description="Правки этого этапа будут потеряны."
              confirmLabel="Вернуть"
              destructive
              onConfirm={() => void reset({ accountId, stage: playbook.stage })}
            >
              {(ask) => (
                <Button size="small" color="inherit" loading={resetting} onClick={ask}>
                  По умолчанию
                </Button>
              )}
            </ConfirmAction>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}
