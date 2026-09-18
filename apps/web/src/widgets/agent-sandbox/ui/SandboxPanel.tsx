import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { getApiErrorMessage } from '@/shared/lib'
import { SectionCard } from '@/shared/ui'
import { FUNNEL_STAGES } from '@/shared/api'
import type { FunnelStage, Gender, TouchKind } from '@/shared/api'
import { FUNNEL_STAGE_META, TOUCH_KIND_META, useRunSandboxMutation } from '@/entities/ai-agent'
import { SandboxResult } from './SandboxResult'
import { agentSandboxStyles as styles } from './AgentSandbox.styles'

interface SandboxPanelProps {
  accountId: string
}

interface HistoryItem {
  role: 'client' | 'bot' | 'manager'
  text: string
}

/** Касания, которые имеет смысл прогонять вручную: у `first_reply` нет своего сценария. */
const TOUCH_KINDS: TouchKind[] = [
  'birth_nudge',
  'diagnostics',
  'reengage',
  'offer',
  'offer_question',
  'price',
  'price_question',
  'discount',
  'reminder',
]

/** Песочница: история + сообщение клиента (или касание) → анализ, ответ, guard, без отправки. */
export function SandboxPanel({ accountId }: SandboxPanelProps) {
  const [run, { data, isLoading, error }] = useRunSandboxMutation()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [message, setMessage] = useState('Здравствуйте! Хочу разбор по отношениям')
  const [stage, setStage] = useState<FunnelStage | ''>('')
  const [touchKind, setTouchKind] = useState<TouchKind>('reengage')
  const [mode, setMode] = useState<'inbound' | 'touch'>('inbound')
  const [gender, setGender] = useState<Gender | ''>('')
  const [requestSummary, setRequestSummary] = useState('')
  const [showPrompts, setShowPrompts] = useState(false)

  const patchHistory = (index: number, patch: Partial<HistoryItem>) =>
    setHistory((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const submit = () =>
    void run({
      accountId,
      body: {
        history: history.filter((item) => item.text.trim()),
        message: mode === 'inbound' ? message : null,
        touchKind: mode === 'touch' ? touchKind : null,
        stage: stage || null,
        slots: { gender: gender || null, requestSummary: requestSummary.trim() || null },
      },
    })

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 5 }}>
        <SectionCard
          title="Сценарий"
          subtitle="Ход проходит Planner → Composer → Guard как настоящий, но ничего не отправляет и не запоминает."
        >
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                fullWidth
                label="Что проверяем"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'inbound' | 'touch')}
              >
                <MenuItem value="inbound">ответ на сообщение клиента</MenuItem>
                <MenuItem value="touch">касание по таймеру</MenuItem>
              </TextField>
              <TextField
                select
                size="small"
                fullWidth
                label="Этап"
                value={stage}
                onChange={(e) => setStage(e.target.value as FunnelStage | '')}
              >
                <MenuItem value="">по умолчанию</MenuItem>
                {FUNNEL_STAGES.map((key) => (
                  <MenuItem key={key} value={key}>
                    {FUNNEL_STAGE_META[key].label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            {mode === 'touch' && (
              <TextField
                select
                size="small"
                fullWidth
                label="Касание"
                value={touchKind}
                onChange={(e) => setTouchKind(e.target.value as TouchKind)}
              >
                {TOUCH_KINDS.map((kind) => (
                  <MenuItem key={kind} value={kind}>
                    {TOUCH_KIND_META[kind]}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                fullWidth
                label="Пол клиента"
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender | '')}
              >
                <MenuItem value="">неизвестен</MenuItem>
                <MenuItem value="f">женский</MenuItem>
                <MenuItem value="m">мужской</MenuItem>
              </TextField>
              <TextField
                size="small"
                fullWidth
                label="Известный запрос"
                value={requestSummary}
                onChange={(e) => setRequestSummary(e.target.value)}
              />
            </Stack>

            <Typography variant="caption" color="text.secondary">
              История переписки (необязательно)
            </Typography>
            {history.map((item, index) => (
              <Stack key={index} direction="row" spacing={1} sx={styles.historyRow}>
                <TextField
                  select
                  size="small"
                  value={item.role}
                  onChange={(e) => patchHistory(index, { role: e.target.value as HistoryItem['role'] })}
                  sx={styles.roleSelect}
                >
                  <MenuItem value="client">клиент</MenuItem>
                  <MenuItem value="bot">бот</MenuItem>
                  <MenuItem value="manager">менеджер</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  value={item.text}
                  onChange={(e) => patchHistory(index, { text: e.target.value })}
                />
                <IconButton
                  size="small"
                  aria-label="Убрать реплику"
                  onClick={() => setHistory(history.filter((_, i) => i !== index))}
                >
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Button
              size="small"
              onClick={() =>
                setHistory([...history, { role: history.length % 2 === 0 ? 'bot' : 'client', text: '' }])
              }
            >
              + реплика
            </Button>

            {mode === 'inbound' && (
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={2}
                label="Новое сообщение клиента"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            )}
            <Button variant="contained" startIcon={<PlayArrowIcon />} loading={isLoading} onClick={submit}>
              Прогнать ход
            </Button>
            {error && <Alert severity="error">{getApiErrorMessage(error, 'Песочница не сработала')}</Alert>}
          </Stack>
        </SectionCard>
      </Grid>

      <Grid size={{ xs: 12, md: 7 }}>
        {data ? (
          <SandboxResult data={data} showPrompts={showPrompts} onTogglePrompts={() => setShowPrompts((v) => !v)} />
        ) : (
          <Typography variant="body2" sx={styles.placeholder}>
            Результат появится здесь: что бот понял, что ответил бы, что заметил guard.
          </Typography>
        )}
      </Grid>
    </Grid>
  )
}
