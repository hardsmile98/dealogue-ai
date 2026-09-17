import { useState } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import { formatDateTime, getApiErrorMessage } from '@/shared/lib'
import type { TurnDto } from '@/shared/api'
import { FUNNEL_STAGE_META, TOUCH_KIND_META, TURN_OUTCOME_META, TURN_TRIGGER_LABELS, useRateTurnMutation } from '@/entities/ai-agent'

interface TurnsJournalProps {
  accountId: string
  chatId: string
  turns: TurnDto[]
}

/** Свёрнутый журнал ходов: анализ, что планировалось, что ушло, guard. */
export function TurnsJournal({ accountId, chatId, turns }: TurnsJournalProps) {
  if (turns.length === 0) return null
  return (
    <Accordion disableGutters sx={{ borderTop: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Журнал ходов бота · {turns.length}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ maxHeight: 360, overflowY: 'auto', pt: 0 }}>
        <Stack spacing={1}>
          {turns.map((turn) => (
            <TurnCard key={turn.id} accountId={accountId} chatId={chatId} turn={turn} />
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}

function TurnCard({ accountId, chatId, turn }: { accountId: string; chatId: string; turn: TurnDto }) {
  const outcome = TURN_OUTCOME_META[turn.outcome]
  const analysis = turn.analysis ?? {}
  const guardHits = turn.guardNotes.flatMap((note) => (note.violations as { detail: string }[] | undefined) ?? [])
  const fixes = turn.guardNotes.flatMap((note) => (note.fixes as string[] | undefined) ?? [])
  const escalation = analysis.escalation as { reason?: string; note?: string } | null | undefined

  return (
    <Box sx={{ p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider', fontSize: 13 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
        <Chip size="small" color={outcome.color} label={outcome.label} />
        <Chip size="small" variant="outlined" label={turn.touchKind ? TOUCH_KIND_META[turn.touchKind] : TURN_TRIGGER_LABELS[turn.trigger]} />
        {turn.stageBefore && turn.stageAfter && (
          <Typography variant="caption" color="text.secondary">
            {FUNNEL_STAGE_META[turn.stageBefore].short}
            {turn.stageAfter !== turn.stageBefore ? ` → ${FUNNEL_STAGE_META[turn.stageAfter].short}` : ''}
          </Typography>
        )}
        {turn.similarCases > 0 && (
          <Chip size="small" variant="outlined" label={`похожих случаев: ${turn.similarCases}`} sx={{ height: 20, fontSize: 11 }} />
        )}
        {turn.repliedAt && (
          <Chip size="small" variant="outlined" color="success" label="клиент ответил" sx={{ height: 20, fontSize: 11 }} />
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(turn.createdAt)} · {turn.tokensIn + turn.tokensOut} ток. · {(turn.durationMs / 1000).toFixed(1)} с
        </Typography>
        <RateTurn accountId={accountId} chatId={chatId} turn={turn} />
      </Stack>
      {typeof analysis.clientIntent === 'string' && analysis.clientIntent && (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          <strong>Понял:</strong> {analysis.clientIntent}
          {typeof analysis.confidence === 'number' && ` (уверенность ${(analysis.confidence as number).toFixed(2)})`}
        </Typography>
      )}
      {escalation?.reason && (
        <Typography variant="body2" color="warning.main">
          Эскалация: {escalation.reason}
          {escalation.note ? ` — ${escalation.note}` : ''}
        </Typography>
      )}
      {turn.error && (
        <Typography variant="body2" color="error.main">
          {turn.error}
        </Typography>
      )}
      {turn.messagesPlanned.length > 0 && (
        <Box sx={{ mt: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {turn.messagesSent.length > 0 ? `Ушло ${turn.messagesSent.length} из ${turn.messagesPlanned.length}` : `Планировалось ${turn.messagesPlanned.length}`}
          </Typography>
          <Stack spacing={0.5} sx={{ mt: 0.25 }}>
            {turn.messagesPlanned.map((m, i) => (
              <Box key={i} sx={{ px: 1, py: 0.5, borderRadius: 1.5, bgcolor: 'rgba(16, 24, 40, 0.04)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.blockId && (
                  <Chip size="small" variant="outlined" label="блок" sx={{ mr: 0.5, height: 18, fontSize: 10 }} />
                )}
                {m.text.length > 600 ? `${m.text.slice(0, 600)}…` : m.text}
              </Box>
            ))}
          </Stack>
        </Box>
      )}
      {(guardHits.length > 0 || fixes.length > 0) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Guard: {[...fixes, ...guardHits.map((v) => v.detail)].join('; ')}
        </Typography>
      )}
    </Box>
  )
}

interface RateTurnProps {
  accountId: string
  chatId: string
  turn: Pick<TurnDto, 'id' | 'rating' | 'ratingNote'>
}

/** 👍 / 👎 с комментарием; 👎 предлагает создать заметку для промпта. */
export function RateTurn({ accountId, chatId, turn }: RateTurnProps) {
  const [rate, { isLoading, error }] = useRateTurnMutation()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(turn.ratingNote ?? '')
  const [createNote, setCreateNote] = useState(false)

  const good = () => void rate({ accountId, chatId, turnId: turn.id, body: { rating: turn.rating === 'good' ? null : 'good' } })
  const bad = async () => {
    const result = await rate({ accountId, chatId, turnId: turn.id, body: { rating: 'bad', note: note.trim() || null, createNote } })
    if (!('error' in result)) setOpen(false)
  }

  return (
    <>
      <Tooltip title="Хороший ход">
        <IconButton size="small" onClick={good} disabled={isLoading} sx={{ p: 0.25 }}>
          {turn.rating === 'good' ? <ThumbUpIcon sx={{ fontSize: 16 }} color="success" /> : <ThumbUpOutlinedIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Tooltip>
      <Tooltip title="Плохой ход — с комментарием">
        <IconButton size="small" onClick={() => setOpen(true)} disabled={isLoading} sx={{ p: 0.25 }}>
          {turn.rating === 'bad' ? <ThumbDownIcon sx={{ fontSize: 16 }} color="error" /> : <ThumbDownOutlinedIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Что не так с этим ходом?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField size="small" fullWidth multiline minRows={3} autoFocus label="Комментарий" value={note} onChange={(e) => setNote(e.target.value)} />
            <FormControlLabel
              control={<Switch size="small" checked={createNote} onChange={(e) => setCreateNote(e.target.checked)} />}
              label="Сохранить как заметку для бота (попадёт в промпт этапа)"
            />
            {error && <Alert severity="error">{getApiErrorMessage(error, 'Не удалось сохранить оценку')}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant="contained" color="error" loading={isLoading} onClick={() => void bad()}>
            Плохой ход
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
