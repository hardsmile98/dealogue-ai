import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { getApiErrorMessage } from '@/shared/lib'
import { FUNNEL_STAGES } from '@/shared/api'
import type { FunnelStage, SandboxResponse, TouchKind } from '@/shared/api'
import { FUNNEL_STAGE_META, TOUCH_KIND_META, useRunSandboxMutation } from '@/entities/ai-agent'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'

interface SandboxPanelProps {
  accountId: string
}

interface HistoryItem {
  role: 'client' | 'bot' | 'manager'
  text: string
}

const TOUCH_KINDS: TouchKind[] = ['birth_nudge', 'diagnostics', 'reengage', 'offer', 'offer_question', 'price', 'price_question', 'discount', 'reminder']

/** Песочница: история + сообщение клиента (или касание) → анализ, ответ, guard, без отправки. */
export function SandboxPanel({ accountId }: SandboxPanelProps) {
  const [run, { data, isLoading, error }] = useRunSandboxMutation()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [message, setMessage] = useState('Здравствуйте! Хочу разбор по отношениям')
  const [stage, setStage] = useState<FunnelStage | ''>('')
  const [touchKind, setTouchKind] = useState<TouchKind>('reengage')
  const [mode, setMode] = useState<'inbound' | 'touch'>('inbound')
  const [gender, setGender] = useState<'' | 'f' | 'm'>('')
  const [requestSummary, setRequestSummary] = useState('')
  const [showPrompts, setShowPrompts] = useState(false)

  const submit = () =>
    void run({
      accountId,
      body: {
        history: history.filter((h) => h.text.trim()),
        message: mode === 'inbound' ? message : null,
        touchKind: mode === 'touch' ? touchKind : null,
        stage: stage || null,
        slots: { gender: gender || null, requestSummary: requestSummary.trim() || null },
      },
    })

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 5 }}>
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography sx={{ fontWeight: 700 }}>Сценарий</Typography>
              <Typography variant="body2" color="text.secondary">
                Ход проходит Planner → Composer → Guard как настоящий, но ничего не отправляет и не запоминает.
              </Typography>
              <Stack direction="row" spacing={1}>
                <TextField select size="small" fullWidth label="Что проверяем" value={mode} onChange={(e) => setMode(e.target.value as 'inbound' | 'touch')}>
                  <MenuItem value="inbound">ответ на сообщение клиента</MenuItem>
                  <MenuItem value="touch">касание по таймеру</MenuItem>
                </TextField>
                <TextField select size="small" fullWidth label="Этап" value={stage} onChange={(e) => setStage(e.target.value as FunnelStage | '')}>
                  <MenuItem value="">по умолчанию</MenuItem>
                  {FUNNEL_STAGES.map((key) => (
                    <MenuItem key={key} value={key}>
                      {FUNNEL_STAGE_META[key].label}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              {mode === 'touch' && (
                <TextField select size="small" fullWidth label="Касание" value={touchKind} onChange={(e) => setTouchKind(e.target.value as TouchKind)}>
                  {TOUCH_KINDS.map((kind) => (
                    <MenuItem key={kind} value={kind}>
                      {TOUCH_KIND_META[kind]}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <Stack direction="row" spacing={1}>
                <TextField select size="small" fullWidth label="Пол клиента" value={gender} onChange={(e) => setGender(e.target.value as '' | 'f' | 'm')}>
                  <MenuItem value="">неизвестен</MenuItem>
                  <MenuItem value="f">женский</MenuItem>
                  <MenuItem value="m">мужской</MenuItem>
                </TextField>
                <TextField size="small" fullWidth label="Известный запрос" value={requestSummary} onChange={(e) => setRequestSummary(e.target.value)} />
              </Stack>

              <Typography variant="caption" color="text.secondary">
                История переписки (необязательно)
              </Typography>
              {history.map((item, index) => (
                <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <TextField
                    select
                    size="small"
                    value={item.role}
                    onChange={(e) => setHistory(history.map((h, i) => (i === index ? { ...h, role: e.target.value as HistoryItem['role'] } : h)))}
                    sx={{ width: 130 }}
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
                    onChange={(e) => setHistory(history.map((h, i) => (i === index ? { ...h, text: e.target.value } : h)))}
                  />
                  <IconButton size="small" onClick={() => setHistory(history.filter((_, i) => i !== index))}>
                    <DeleteOutlinedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button size="small" onClick={() => setHistory([...history, { role: history.length % 2 === 0 ? 'bot' : 'client', text: '' }])}>
                + реплика
              </Button>

              {mode === 'inbound' && (
                <TextField size="small" fullWidth multiline minRows={2} label="Новое сообщение клиента" value={message} onChange={(e) => setMessage(e.target.value)} />
              )}
              <Button variant="contained" startIcon={<PlayArrowIcon />} loading={isLoading} onClick={submit}>
                Прогнать ход
              </Button>
              {error && <Alert severity="error">{getApiErrorMessage(error, 'Песочница не сработала')}</Alert>}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 7 }}>
        {data ? <SandboxResult data={data} showPrompts={showPrompts} onTogglePrompts={() => setShowPrompts((v) => !v)} /> : (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Результат появится здесь: что бот понял, что ответил бы, что заметил guard.
          </Typography>
        )}
      </Grid>
    </Grid>
  )
}

function SandboxResult({ data, showPrompts, onTogglePrompts }: { data: SandboxResponse; showPrompts: boolean; onTogglePrompts: () => void }) {
  const analysis = data.analysis ?? {}
  const slots = (analysis.slots as Record<string, unknown> | undefined) ?? {}
  const guardHits = data.guardNotes.flatMap((note) => (note.violations as { detail: string }[] | undefined) ?? [])
  const fixes = data.guardNotes.flatMap((note) => (note.fixes as string[] | undefined) ?? [])

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
        <Chip size="small" variant="outlined" label={`${FUNNEL_STAGE_META[data.stage].short} → ${FUNNEL_STAGE_META[data.stageAfter].short}`} />
        {data.verdict.kind === 'proceed' && <Chip size="small" color={data.send ? 'success' : 'default'} label={data.send ? 'ответил бы' : 'промолчал бы'} />}
        {data.verdict.kind === 'handoff' && (
          <Chip size="small" color="warning" label={`менеджеру: ${HANDOFF_REASON_LABELS[data.verdict.reason ?? ''] ?? data.verdict.reason}`} />
        )}
        {data.verdict.kind === 'skip' && <Chip size="small" label={`пропуск: ${data.verdict.detail}`} />}
        {!data.guardOk && <Chip size="small" color="error" label="guard отклонил дважды" />}
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {data.usage.model} · {data.usage.tokensIn + data.usage.tokensOut} ток. · {(data.usage.durationMs / 1000).toFixed(1)} с
        </Typography>
      </Stack>

      {data.task && (
        <Typography variant="body2" color="text.secondary">
          <strong>Задача хода:</strong> {data.task}
        </Typography>
      )}
      {data.verdict.detail && data.verdict.kind !== 'proceed' && <Alert severity="warning">{data.verdict.detail}</Alert>}

      {data.messages.length > 0 && (
        <Stack spacing={0.75}>
          {data.messages.map((m, i) => (
            <Box key={i} sx={{ alignSelf: 'flex-end', maxWidth: '85%', px: 1.75, py: 1, borderRadius: 3, bgcolor: '#e0e7ff', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14 }}>
              {m.blockKind && <Chip size="small" variant="outlined" label={`блок ${m.blockKind}`} sx={{ mb: 0.5, height: 18, fontSize: 10 }} />}
              <Box>{m.text}</Box>
            </Box>
          ))}
        </Stack>
      )}
      {data.silentReason && <Alert severity="info">Промолчал бы: {data.silentReason}</Alert>}

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ fontSize: 13 }}>
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Что понял</Typography>
          {typeof analysis.clientIntent === 'string' && <div>Намерение: {analysis.clientIntent}</div>}
          <div>Язык: {String(analysis.language ?? '—')} · уверенность {typeof analysis.confidence === 'number' ? analysis.confidence.toFixed(2) : '—'} · продвижение: {String(analysis.stageProgress ?? 'stay')}</div>
          {Object.entries(slots).filter(([, v]) => v !== null && v !== false && v !== undefined).length > 0 && (
            <div>
              Слоты:{' '}
              {Object.entries(slots)
                .filter(([, v]) => v !== null && v !== false && v !== undefined)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(', ')}
            </div>
          )}
          {typeof analysis.unansweredQuestion === 'string' && analysis.unansweredQuestion && <div>Вопрос клиента: {analysis.unansweredQuestion}</div>}
          {(fixes.length > 0 || guardHits.length > 0) && (
            <div style={{ marginTop: 6 }}>
              <strong>Guard:</strong> {[...fixes, ...guardHits.map((v) => v.detail)].join('; ')}
            </div>
          )}
          <div style={{ marginTop: 6, color: 'rgba(0,0,0,0.6)' }}>
            Образцы: {data.examples.map((e) => `${e.kind} «${e.title}»`).join(', ') || '—'}. Блоки: {data.blocks.map((b) => b.title).join(', ') || '—'}.
          </div>
        </CardContent>
      </Card>

      {data.prompts && (
        <Box>
          <Button size="small" onClick={onTogglePrompts}>
            {showPrompts ? 'Скрыть промпт' : 'Показать промпт'}
          </Button>
          {showPrompts && (
            <Box component="pre" sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: 'rgba(16, 24, 40, 0.04)', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 480, overflowY: 'auto' }}>
              {`=== SYSTEM ===\n${data.prompts.system}\n\n=== USER ===\n${data.prompts.user}`}
            </Box>
          )}
        </Box>
      )}
    </Stack>
  )
}
