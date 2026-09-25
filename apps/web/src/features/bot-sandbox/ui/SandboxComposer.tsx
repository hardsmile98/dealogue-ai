import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import FastForwardIcon from '@mui/icons-material/FastForward'
import ReplyIcon from '@mui/icons-material/Reply'
import SendIcon from '@mui/icons-material/Send'
import { JOB_KIND_LABELS } from '@/shared/api'
import type { SandboxSessionDto } from '@/shared/api'
import { formatDateTime, getApiErrorMessage } from '@/shared/lib'
import {
  useAddSandboxMessagesMutation,
  useAdvanceSandboxMutation,
  useReadSandboxMutation,
  useRespondSandboxMutation,
  useSetSandboxModeMutation,
} from '../api/sandboxApi'
import { sandboxStyles as styles } from './sandbox.styles'

const SKIPS: { label: string; minutes: number }[] = [
  { label: '+10 мин', minutes: 10 },
  { label: '+1 ч', minutes: 60 },
  { label: '+1 день', minutes: 60 * 24 },
]

interface SandboxComposerProps {
  session: SandboxSessionDto
}

/**
 * Реплики за клиента и управление временем. Enter — добавить сообщение
 * (клиент пишет несколькими подряд), Ctrl+Enter — добавить и сразу
 * попросить агента ответить на всё новое.
 */
export function SandboxComposer({ session }: SandboxComposerProps) {
  const args = { accountId: session.accountId, sessionId: session.id }
  const [text, setText] = useState('')
  const [addMessages, addState] = useAddSandboxMessagesMutation()
  const [respond, respondState] = useRespondSandboxMutation()
  const [markRead, readState] = useReadSandboxMutation()
  const [advance, advanceState] = useAdvanceSandboxMutation()
  const [setMode, modeState] = useSetSandboxModeMutation()

  const error = addState.error ?? respondState.error ?? readState.error ?? advanceState.error ?? modeState.error
  const busy = session.running
  const unread = session.messages.some((message) => message.direction === 'out' && !message.readAt)

  const add = async (thenRespond: boolean) => {
    const value = text.trim()
    if (value) {
      // Поле чистится сразу: клиент пишет следующее сообщение, не дожидаясь сервера.
      setText('')
      const ok = await addMessages({ ...args, body: { texts: [value] } })
        .unwrap()
        .then(() => true)
        .catch(() => false)
      if (!ok) {
        setText((current) => (current ? `${value}
${current}` : value))
        return
      }
    }
    if (thenRespond && !busy) await respond(args).unwrap().catch(() => null)
  }

  return (
    <Box sx={styles.composer}>
      {error && <Alert severity="error">{getApiErrorMessage(error, 'Действие не выполнено')}</Alert>}
      {session.lastError && <Alert severity="warning">Последний ход: {session.lastError}</Alert>}

      <Box sx={styles.composerRow}>
        <TextField
          fullWidth
          multiline
          maxRows={6}
          size="small"
          placeholder="Сообщение за клиента…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return
            event.preventDefault()
            void add(event.ctrlKey || event.metaKey)
          }}
        />
        <Tooltip title="Добавить сообщение клиента">
          <span>
            <Button variant="outlined" onClick={() => void add(false)} disabled={!text.trim() || addState.isLoading} sx={{ minWidth: 0, px: 1.25 }}>
              <SendIcon fontSize="small" />
            </Button>
          </span>
        </Tooltip>
      </Box>

      <Box sx={styles.controls}>
        <Button
          variant="contained"
          size="small"
          startIcon={<ReplyIcon />}
          disabled={busy || session.mode !== 'auto' || (session.pendingCount === 0 && !text.trim())}
          onClick={() => void add(true)}
        >
          Ответить агентом{session.pendingCount > 0 ? ` (${session.pendingCount})` : ''}
        </Button>
        <Button size="small" startIcon={<DoneAllIcon />} disabled={!unread || readState.isLoading} onClick={() => void markRead(args)}>
          Клиент прочитал
        </Button>
        <Tooltip
          title={
            session.nextJob
              ? `${JOB_KIND_LABELS[session.nextJob.kind] ?? session.nextJob.kind} — ${formatDateTime(session.nextJob.runAt)}`
              : 'Запланированных событий нет'
          }
        >
          <span>
            <Button size="small" startIcon={<FastForwardIcon />} disabled={busy || !session.nextJob} onClick={() => void advance({ ...args, body: {} })}>
              До события
            </Button>
          </span>
        </Tooltip>
        <ButtonGroup size="small" variant="text" disabled={busy}>
          {SKIPS.map((skip) => (
            <Button key={skip.minutes} onClick={() => void advance({ ...args, body: { minutes: skip.minutes } })}>
              {skip.label}
            </Button>
          ))}
        </ButtonGroup>
        {session.mode !== 'auto' && (
          <Button size="small" color="warning" disabled={busy} onClick={() => void setMode({ ...args, body: { mode: 'auto' } })}>
            Вернуть агенту
          </Button>
        )}
      </Box>
      <Typography sx={[styles.hint, styles.composerHint]}>
        Enter — добавить сообщение, Ctrl+Enter — добавить и попросить ответ. Время в песочнице виртуальное: задержки
        агента не ждутся, а сдвигают часы. «Клиент прочитал» нужно для предложения и цен — агент шлёт их только после
        прочтения прошлой вехи.
      </Typography>
    </Box>
  )
}
