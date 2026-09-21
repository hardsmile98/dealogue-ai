import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import FastForwardIcon from '@mui/icons-material/FastForward'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SendIcon from '@mui/icons-material/Send'
import { formatAhead, formatDateTime, getApiErrorMessage, isMutationSuccess } from '@/shared/lib'
import { ConfirmAction, SectionCard } from '@/shared/ui'
import type { FunnelStage, SimAction, SimEvent, SimStartSlots, SimState, TouchKind } from '@/shared/api'
import { FUNNEL_STAGE_META, TOUCH_KIND_META, useRunSandboxMutation } from '@/entities/ai-agent'
import { SandboxStart } from './SandboxStart'
import { SandboxState } from './SandboxState'
import { SandboxTimeline } from './SandboxTimeline'
import { agentSandboxStyles as styles } from './AgentSandbox.styles'

interface SandboxPanelProps {
  accountId: string
}

interface Session {
  state: SimState
  events: SimEvent[]
}

/** Насколько промотать время. Двадцать часов — типичная ночь молчания лида. */
const WAIT_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 минут' },
  { minutes: 120, label: '2 часа' },
  { minutes: 360, label: '6 часов' },
  { minutes: 720, label: '12 часов' },
  { minutes: 1200, label: '20 часов' },
  { minutes: 1440, label: 'сутки' },
  { minutes: 4320, label: '3 дня' },
  { minutes: 10_080, label: 'неделю' },
]

/** Касания, которые имеет смысл запускать вручную: у `first_reply` нет своего сценария. */
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

/**
 * Сценарий переживает перезагрузку страницы; версия ключа отсекает старый
 * формат. Поднимайте её, когда меняется форма `SimState` или карточки
 * клиента: сохранённый сценарий рисуется до первого запроса к серверу, и
 * поля, которых в нём нет, роняют панель.
 */
const STORAGE_KEY = (accountId: string) => `dealogue.sandbox.v2.${accountId}`

function loadSession(accountId: string): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(accountId))
    const parsed = raw ? (JSON.parse(raw) as Session) : null
    return parsed?.state?.now && Array.isArray(parsed.events) ? parsed : null
  } catch {
    return null
  }
}

function saveSession(accountId: string, session: Session | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY(accountId), JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY(accountId))
  } catch {
    // Приватный режим или переполненное хранилище — сценарий просто не переживёт перезагрузку.
  }
}

/**
 * Песочница: полноценный диалог с выдуманным клиентом. Пишете за клиента —
 * бот отвечает тем же ходом, что и в настоящем чате; «клиент молчит» двигает
 * виртуальные часы и показывает касания по таймеру; «очистить» — заново.
 *
 * У каждого аккаунта свой сценарий, поэтому смена аккаунта пересоздаёт
 * панель целиком — состояние одного чата не утекает в другой.
 */
export function SandboxPanel({ accountId }: SandboxPanelProps) {
  return <SandboxSession key={accountId} accountId={accountId} />
}

function SandboxSession({ accountId }: SandboxPanelProps) {
  const [run, { isLoading, error }] = useRunSandboxMutation()
  const [session, setSession] = useState<Session | null>(() => loadSession(accountId))
  const [text, setText] = useState('')
  const [waitMinutes, setWaitMinutes] = useState(1200)
  const [read, setRead] = useState(false)
  const [manualTouch, setManualTouch] = useState<TouchKind | ''>('')

  useEffect(() => saveSession(accountId, session), [accountId, session])

  const step = async (action: SimAction) => {
    const result = await run({ accountId, body: { action, state: action.kind === 'start' ? null : session?.state } })
    if (!isMutationSuccess(result)) return
    setSession((prev) => ({
      state: result.data.state,
      events: action.kind === 'start' ? result.data.events : [...(prev?.events ?? []), ...result.data.events],
    }))
  }

  const start = (stage: FunnelStage | null, slots: SimStartSlots) => void step({ kind: 'start', stage, slots })

  const send = () => {
    const value = text.trim()
    if (!value || isLoading) return
    setText('')
    void step({ kind: 'client', text: value })
  }

  const errorText = error ? getApiErrorMessage(error, 'Песочница не сработала') : null
  if (!session) return <SandboxStart onStart={start} loading={isLoading} error={errorText} />

  const { state } = session
  const toNextTouch = state.nextTouchAt
    ? Math.max(1, Math.ceil((new Date(state.nextTouchAt).getTime() - new Date(state.now).getTime()) / 60_000) + 1)
    : null

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 8 }}>
        <SectionCard
          title="Диалог с клиентом"
          subtitle="Пишите за клиента и смотрите, что ответил бы бот. Ничего не отправляется в Telegram."
        >
          <Stack direction="row" sx={styles.toolbar}>
            <Chip size="small" label={FUNNEL_STAGE_META[state.stage].label} />
            <Chip size="small" variant="outlined" label={`в песочнице ${formatDateTime(state.now)}`} />
            {state.nextTouchKind && state.nextTouchAt && (
              <Chip
                size="small"
                variant="outlined"
                color="info"
                label={`${TOUCH_KIND_META[state.nextTouchKind]} ${formatAhead(state.nextTouchAt, state.now)}`}
              />
            )}
            <Box sx={styles.spacer} />
            <ConfirmAction
              question="Очистить песочницу?"
              description="Диалог и всё состояние воронки будут забыты, начнётся новый сценарий."
              confirmLabel="Очистить"
              destructive
              onConfirm={() => setSession(null)}
            >
              {(ask) => (
                <Button size="small" color="inherit" startIcon={<RestartAltIcon />} onClick={ask}>
                  Очистить
                </Button>
              )}
            </ConfirmAction>
          </Stack>

          <SandboxTimeline events={session.events} busy={isLoading} />

          <Box sx={styles.composer}>
            {errorText && (
              <Alert severity="error" sx={styles.startHint}>
                {errorText}
              </Alert>
            )}
            <Box sx={styles.composerRow}>
              <TextField
                fullWidth
                multiline
                maxRows={5}
                size="small"
                placeholder="Что напишет клиент… (Ctrl+Enter — отправить)"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    send()
                  }
                }}
              />
              <IconButton color="primary" aria-label="Отправить за клиента" disabled={!text.trim() || isLoading} onClick={send}>
                <SendIcon />
              </IconButton>
            </Box>

            <Box sx={styles.actionsRow}>
              <TextField
                select
                size="small"
                label="Клиент молчит"
                value={waitMinutes}
                sx={styles.waitSelect}
                onChange={(event) => setWaitMinutes(Number(event.target.value))}
              >
                {WAIT_OPTIONS.map((option) => (
                  <MenuItem key={option.minutes} value={option.minutes}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={<Checkbox size="small" checked={read} onChange={(event) => setRead(event.target.checked)} />}
                label="прочитал"
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={<FastForwardIcon />}
                loading={isLoading}
                onClick={() => void step({ kind: 'wait', minutes: waitMinutes, read })}
              >
                Промотать
              </Button>
              {toNextTouch !== null && (
                <Button size="small" loading={isLoading} onClick={() => void step({ kind: 'wait', minutes: toNextTouch, read })}>
                  До касания
                </Button>
              )}
            </Box>

            <Box sx={styles.actionsRow}>
              <TextField
                select
                size="small"
                label="Ход бота вручную"
                value={manualTouch}
                sx={styles.turnSelect}
                onChange={(event) => setManualTouch(event.target.value as TouchKind | '')}
              >
                <MenuItem value="">следующий шаг по этапу</MenuItem>
                {TOUCH_KINDS.map((kind) => (
                  <MenuItem key={kind} value={kind}>
                    {TOUCH_KIND_META[kind]}
                  </MenuItem>
                ))}
              </TextField>
              <Button size="small" loading={isLoading} onClick={() => void step({ kind: 'touch', touchKind: manualTouch || null })}>
                Сделать ход
              </Button>
              <Typography variant="caption" color="text.secondary">
                Как кнопка «Диагностика сейчас» в чате: бот ходит, не дожидаясь таймера.
              </Typography>
            </Box>
          </Box>
        </SectionCard>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }}>
        <SandboxState state={state} busy={isLoading} onResume={() => void step({ kind: 'resume' })} />
      </Grid>
    </Grid>
  )
}
