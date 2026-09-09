import { useState } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { formatNumber, getApiErrorMessage } from '@/shared/lib'
import type { TestGenerateResponse } from '@/shared/api'
import { useGetAiSettingsQuery, useTestGenerateMutation } from '@/entities/ai-agent'
import { useGetChatsQuery } from '@/entities/chat'
import type { Chat } from '@/entities/chat'

interface TestGeneratePanelProps {
  accountId: string
}

/** Песочница: что бы ИИ ответил в выбранном чате — без отправки. */
export function TestGeneratePanel({ accountId }: TestGeneratePanelProps) {
  const { data: chats } = useGetChatsQuery({ accountId })
  const { data: settings } = useGetAiSettingsQuery(accountId)
  const [generate, { isLoading }] = useTestGenerateMutation()
  const [chat, setChat] = useState<Chat | null>(null)
  const [mode, setMode] = useState<'reply' | 'followup'>('reply')
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<TestGenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!chat) return
    setError(null)
    setResult(null)
    try {
      const response = await generate({
        accountId,
        chatId: chat.id,
        ...(mode === 'followup' ? { followupStep: step } : {}),
      }).unwrap()
      setResult(response)
    } catch (caught) {
      setError(getApiErrorMessage(caught))
    }
  }

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Песочница
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Выберите чат — ИИ сгенерирует ответ на последнее сообщение клиента, ничего не отправляя. На старых чатах
          рядом покажем, что на самом деле ответил менеджер: так проще понять, похоже ли.
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
          <Autocomplete
            options={chats ?? []}
            value={chat}
            onChange={(_, next) => setChat(next)}
            getOptionLabel={(c) => `${c.peer.name}${c.peer.username ? ` @${c.peer.username}` : ''}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} label="Чат" size="small" />}
            sx={{ minWidth: 320, flexGrow: 1 }}
          />
          <TextField select label="Режим" value={mode} onChange={(e) => setMode(e.target.value as 'reply' | 'followup')} size="small" sx={{ minWidth: 200 }}>
            <MenuItem value="reply">Ответ на сообщение</MenuItem>
            <MenuItem value="followup">Дожим</MenuItem>
          </TextField>
          {mode === 'followup' && (
            <TextField select label="Шаг дожима" value={step} onChange={(e) => setStep(Number(e.target.value))} size="small" sx={{ minWidth: 160 }}>
              {(settings?.followups ?? []).map((f, i) => (
                <MenuItem key={i} value={i}>
                  {i + 1}: через {f.afterDays} дн.
                </MenuItem>
              ))}
            </TextField>
          )}
          <Button variant="contained" disabled={!chat} loading={isLoading} onClick={() => void run()}>
            Сгенерировать
          </Button>
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {result && <ResultView result={result} />}
    </Stack>
  )
}

function ResultView({ result }: { result: TestGenerateResponse }) {
  const { decision, guard } = result
  const willSend = guard.messages.length > 0 && !guard.silent
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 2 }}>
        <Chip size="small" label={`этап: ${guard.stage ?? '—'}`} />
        <Chip size="small" label={`уверенность ${Math.round(decision.confidence * 100)}%`} />
        {guard.silent && <Chip size="small" color="default" label="промолчит" />}
        {guard.readyToPay && <Chip size="small" color="success" label="готов к оплате → менеджеру" />}
        {guard.needsHuman && <Chip size="small" color="warning" label="нужен менеджер" />}
        <Chip size="small" variant="outlined" label={`${result.provider} · ${result.model}`} />
        <Chip size="small" variant="outlined" label={`${formatNumber(result.usage.inputTokens)} → ${formatNumber(result.usage.outputTokens)} токенов, ${result.latencyMs} мс`} />
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', mb: 1 }}>
            {willSend ? 'ИИ отправил бы' : 'ИИ ничего не отправил бы'}
          </Typography>
          <Stack spacing={1}>
            {(willSend ? guard.messages : decision.messages).map((m, i) => (
              <Box key={i} sx={{ px: 1.75, py: 1, borderRadius: 3, bgcolor: '#e0e7ff', fontSize: 14, whiteSpace: 'pre-wrap', opacity: willSend ? 1 : 0.6 }}>
                {m}
              </Box>
            ))}
          </Stack>
          {decision.reason && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>Почему: {decision.reason}</Typography>
          )}
          {guard.notes.length > 0 && (
            <Typography sx={{ fontSize: 12, color: 'warning.main', mt: 0.5 }}>Проверки: {guard.notes.join(', ')}</Typography>
          )}
        </Box>
        {result.actualManagerReply && (
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', mb: 1 }}>
              Менеджер на самом деле ответил
            </Typography>
            <Box sx={{ px: 1.75, py: 1, borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', fontSize: 14, whiteSpace: 'pre-wrap' }}>
              {result.actualManagerReply}
            </Box>
          </Box>
        )}
      </Stack>

      {result.exchanges.length > 0 && (
        <Accordion variant="outlined" disableGutters sx={{ mt: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 600 }}>Похожие прошлые обмены, которые видел ИИ ({result.exchanges.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              {result.exchanges.map((e, i) => (
                <Box key={i}>
                  <Typography sx={{ fontSize: 13 }}>
                    <strong>Клиент:</strong> {e.clientText}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                    <strong>Менеджер:</strong> {e.managerText}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}

      <Accordion variant="outlined" disableGutters sx={{ mt: 1 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography sx={{ fontWeight: 600 }}>Промпт целиком</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box component="pre" sx={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', m: 0, fontFamily: 'ui-monospace, monospace' }}>
            {`=== SYSTEM ===\n${result.prompt.system}\n\n${result.prompt.messages.map((m) => `=== ${m.role.toUpperCase()} ===\n${m.content}`).join('\n\n')}`}
          </Box>
        </AccordionDetails>
      </Accordion>
    </Paper>
  )
}
