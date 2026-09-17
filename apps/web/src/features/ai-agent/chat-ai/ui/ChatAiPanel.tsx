import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { formatDateTime, formatRelative, getApiErrorMessage } from '@/shared/lib'
import { FUNNEL_STAGES } from '@/shared/api'
import type { ChatAiStateDto, ChatMode, FunnelStage, Gender, TouchKind } from '@/shared/api'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'
import {
  CHAT_MODE_META,
  FUNNEL_STAGE_META,
  TOUCH_KIND_META,
  useGetChatAiQuery,
  useManualTurnMutation,
  usePatchChatAiMutation,
  useResumeChatAiMutation,
} from '@/entities/ai-agent'
import { useGetCategoriesQuery } from '@/entities/ai-library'
import { DraftCard } from '@/features/ai-agent/draft'

interface ChatAiPanelProps {
  accountId: string
  chatId: string
}

/** Шапка чата: режим, этап, касание, слоты, предупреждения и действия менеджера. */
export function ChatAiPanel({ accountId, chatId }: ChatAiPanelProps) {
  const { data, error } = useGetChatAiQuery({ accountId, chatId })
  const [patch, { isLoading: patching, error: patchError }] = usePatchChatAiMutation()
  const [manualTurn, { isLoading: turning }] = useManualTurnMutation()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [resumeOpen, setResumeOpen] = useState(false)
  const [slotsOpen, setSlotsOpen] = useState(false)

  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить состояние бота')}</Alert>
  if (!data) return null

  const mode = CHAT_MODE_META[data.mode]
  const stage = FUNNEL_STAGE_META[data.stage]
  const s = data.slots
  const botActive = data.mode === 'auto' || data.mode === 'supervised'

  const setMode = (next: ChatMode) => {
    setMenuAnchor(null)
    void patch({ accountId, chatId, patch: { mode: next } })
  }
  const runTouch = (touchKind: TouchKind | null) => {
    setMenuAnchor(null)
    void manualTurn({ accountId, chatId, touchKind })
  }

  return (
    <Box sx={{ px: 2, py: 1, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
        <Tooltip title={mode.description}>
          <Chip size="small" color={mode.color} label={mode.label} sx={{ fontWeight: 600 }} />
        </Tooltip>
        <Tooltip title={`Этап воронки: ${stage.label}`}>
          <Chip size="small" variant="outlined" label={stage.label} />
        </Tooltip>
        {data.nextTouchKind && data.nextTouchAt && botActive && (
          <Tooltip title={formatDateTime(data.nextTouchAt)}>
            <Chip size="small" variant="outlined" color="info" label={`${TOUCH_KIND_META[data.nextTouchKind]} · ${formatRelative(data.nextTouchAt)}`} />
          </Tooltip>
        )}
        {data.handoffReason && data.mode === 'manager' && (
          <Chip size="small" color="warning" label={`передан: ${HANDOFF_REASON_LABELS[data.handoffReason] ?? data.handoffReason}`} />
        )}
        {s.isMinor && <Chip size="small" color="error" label="несовершеннолетний" />}
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" variant="outlined" onClick={() => setResumeOpen(true)} disabled={patching}>
          {botActive ? 'Сменить этап' : 'Вернуть боту'}
        </Button>
        <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Действия бота">
          <MoreVertIcon fontSize="small" />
        </IconButton>
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
          <MenuItem disabled={!botActive || turning} onClick={() => runTouch('diagnostics')}>
            Диагностика сейчас
          </MenuItem>
          <MenuItem disabled={!botActive || turning} onClick={() => runTouch(null)}>
            Сделать ход по этапу сейчас
          </MenuItem>
          <MenuItem disabled={data.mode === 'manager'} onClick={() => setMode('manager')}>
            Передать менеджеру
          </MenuItem>
          <MenuItem disabled={data.mode === 'off'} onClick={() => setMode('off')}>
            Отключить бота в чате
          </MenuItem>
        </Menu>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {describeSlots(data)}
        </Typography>
        <IconButton size="small" onClick={() => setSlotsOpen(true)} aria-label="Исправить данные клиента" sx={{ p: 0.25 }}>
          <EditOutlinedIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Stack>

      {patchError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {getApiErrorMessage(patchError, 'Не удалось изменить состояние')}
        </Alert>
      )}
      {data.draft && <DraftCard accountId={accountId} chatId={chatId} draft={data.draft} />}

      <ResumeDialog
        open={resumeOpen}
        onClose={() => setResumeOpen(false)}
        accountId={accountId}
        chatId={chatId}
        current={data}
      />
      <SlotsDialog open={slotsOpen} onClose={() => setSlotsOpen(false)} accountId={accountId} chatId={chatId} current={data} />
    </Box>
  )
}

function describeSlots(data: ChatAiStateDto): string {
  const s = data.slots
  const parts: string[] = []
  parts.push(s.birthDate ? `ДР ${s.birthDate}${s.age !== null ? ` (${s.age})` : ''}` : s.birthDateText ? `ДР «${s.birthDateText}»` : 'ДР —')
  parts.push(s.birthPlace ? `место ${s.birthPlace}` : 'место —')
  parts.push(s.gender === 'f' ? 'жен.' : s.gender === 'm' ? 'муж.' : 'пол —')
  parts.push(`язык ${s.language}`)
  parts.push(s.requestSummary ? `запрос: ${s.requestSummary}` : 'запрос —')
  if (s.requestCategoryKey) parts.push(`категория ${s.requestCategoryKey}`)
  return parts.join(' · ')
}

// --- «Вернуть боту» ---------------------------------------------------------------

interface ResumeDialogProps {
  open: boolean
  onClose: () => void
  accountId: string
  chatId: string
  current: ChatAiStateDto
}

function ResumeDialog({ open, onClose, accountId, chatId, current }: ResumeDialogProps) {
  const [resume, { isLoading, error }] = useResumeChatAiMutation()
  const [mode, setMode] = useState<'auto' | 'supervised'>(current.mode === 'auto' ? 'auto' : 'supervised')
  const [stage, setStage] = useState<FunnelStage>(current.stage)
  const [when, setWhen] = useState<'now' | 'interval'>('interval')

  const submit = async () => {
    const result = await resume({ accountId, chatId, body: { mode, stage, when } })
    if (!('error' in result)) onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Вернуть боту</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select size="small" label="Режим" value={mode} onChange={(e) => setMode(e.target.value as 'auto' | 'supervised')}>
            <MenuItem value="auto">{CHAT_MODE_META.auto.label}</MenuItem>
            <MenuItem value="supervised">{CHAT_MODE_META.supervised.label}</MenuItem>
          </TextField>
          <TextField select size="small" label="Этап" value={stage} onChange={(e) => setStage(e.target.value as FunnelStage)}>
            {FUNNEL_STAGES.map((key) => (
              <MenuItem key={key} value={key}>
                {FUNNEL_STAGE_META[key].label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Следующее касание" value={when} onChange={(e) => setWhen(e.target.value as 'now' | 'interval')}>
            <MenuItem value="interval">по интервалу этапа</MenuItem>
            <MenuItem value="now">сейчас</MenuItem>
          </TextField>
          <Typography variant="caption" color="text.secondary">
            Открытые алерты и черновики по чату закроются. Если есть необработанные сообщения клиента, бот ответит на них.
          </Typography>
          {error && <Alert severity="error">{getApiErrorMessage(error, 'Не удалось вернуть боту')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" loading={isLoading} onClick={() => void submit()}>
          Вернуть
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// --- правка слотов -----------------------------------------------------------------

interface SlotsDialogProps {
  open: boolean
  onClose: () => void
  accountId: string
  chatId: string
  current: ChatAiStateDto
}

function SlotsDialog({ open, onClose, accountId, chatId, current }: SlotsDialogProps) {
  const [patch, { isLoading, error }] = usePatchChatAiMutation()
  const { data: categories } = useGetCategoriesQuery(accountId)
  const s = current.slots
  const [birthDate, setBirthDate] = useState(s.birthDate ?? '')
  const [birthPlace, setBirthPlace] = useState(s.birthPlace ?? '')
  const [gender, setGender] = useState<Gender | ''>(s.gender ?? '')
  const [language, setLanguage] = useState(s.language)
  const [requestSummary, setRequestSummary] = useState(s.requestSummary ?? '')
  const [requestCategoryKey, setRequestCategoryKey] = useState(s.requestCategoryKey ?? '')
  const [manualNotes, setManualNotes] = useState(current.manualNotes ?? '')

  const submit = async () => {
    const result = await patch({
      accountId,
      chatId,
      patch: {
        slots: {
          birthDate: birthDate.trim() || null,
          birthPlace: birthPlace.trim() || null,
          gender: gender || null,
          language: language.trim() || 'ru',
          requestSummary: requestSummary.trim() || null,
          requestCategoryKey: requestCategoryKey || null,
        },
        manualNotes: manualNotes.trim() || null,
      },
    })
    if (!('error' in result)) onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Данные клиента</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField size="small" fullWidth label="Дата рождения (ГГГГ-ММ-ДД)" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            <TextField size="small" fullWidth label="Место рождения" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select size="small" fullWidth label="Пол" value={gender} onChange={(e) => setGender(e.target.value as Gender | '')}>
              <MenuItem value="">не известен</MenuItem>
              <MenuItem value="f">женский</MenuItem>
              <MenuItem value="m">мужской</MenuItem>
            </TextField>
            <TextField select size="small" fullWidth label="Язык" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <MenuItem value="ru">русский</MenuItem>
              <MenuItem value="en">английский</MenuItem>
            </TextField>
          </Stack>
          <TextField size="small" fullWidth multiline minRows={2} label="Запрос клиента" value={requestSummary} onChange={(e) => setRequestSummary(e.target.value)} />
          <TextField select size="small" fullWidth label="Категория" value={requestCategoryKey} onChange={(e) => setRequestCategoryKey(e.target.value)}>
            <MenuItem value="">не выбрана</MenuItem>
            {(categories ?? []).map((c) => (
              <MenuItem key={c.key} value={c.key}>
                {c.title}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" fullWidth multiline minRows={2} label="Заметка по чату (видна только вам)" value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} />
          <Typography variant="caption" color="text.secondary">
            Поля, которые вы поправили, бот больше не перезаписывает.
          </Typography>
          {error && <Alert severity="error">{getApiErrorMessage(error, 'Не удалось сохранить')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" loading={isLoading} onClick={() => void submit()}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}
