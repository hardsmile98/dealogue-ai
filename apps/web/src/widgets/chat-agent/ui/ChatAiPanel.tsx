import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { formatDateTime, formatRelative, getApiErrorMessage } from '@/shared/lib'
import type { ChatAiStateDto, ChatMode, TouchKind } from '@/shared/api'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'
import {
  CHAT_MODE_META,
  FUNNEL_STAGE_META,
  TOUCH_KIND_META,
  useGetChatAiQuery,
  useManualTurnMutation,
  usePatchChatAiMutation,
} from '@/entities/ai-agent'
import { DraftCard } from '@/features/ai-agent/draft'
import { ResumeDialog } from './ResumeDialog'
import { SlotsDialog } from './SlotsDialog'
import { chatAgentStyles as styles } from './ChatAgent.styles'

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

  if (error) {
    return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить состояние бота')}</Alert>
  }
  // Панель — часть шапки чата: пока состояния нет, она просто не занимает места.
  if (!data) return null

  const mode = CHAT_MODE_META[data.mode]
  const stage = FUNNEL_STAGE_META[data.stage]
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
    <Box sx={styles.root}>
      <Stack direction="row" spacing={1} sx={styles.headerRow}>
        <Tooltip title={mode.description}>
          <Chip size="small" color={mode.color} label={mode.label} sx={styles.modeChip} />
        </Tooltip>
        <Tooltip title={`Этап воронки: ${stage.label}`}>
          <Chip size="small" variant="outlined" label={stage.label} />
        </Tooltip>
        {data.nextTouchKind && data.nextTouchAt && botActive && (
          <Tooltip title={formatDateTime(data.nextTouchAt)}>
            <Chip
              size="small"
              variant="outlined"
              color="info"
              label={`${TOUCH_KIND_META[data.nextTouchKind]} · ${formatRelative(data.nextTouchAt)}`}
            />
          </Tooltip>
        )}
        {data.handoffReason && data.mode === 'manager' && (
          <Chip
            size="small"
            color="warning"
            label={`передан: ${HANDOFF_REASON_LABELS[data.handoffReason] ?? data.handoffReason}`}
          />
        )}
        {data.slots.isMinor && <Chip size="small" color="error" label="несовершеннолетний" />}
        <Box sx={styles.spacer} />
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

      <Stack direction="row" spacing={1} sx={styles.slotsRow}>
        <Tooltip title={describeSources(data)} placement="bottom-start">
          <Typography variant="caption" color="text.secondary">
            {describeSlots(data)}
          </Typography>
        </Tooltip>
        <IconButton
          size="small"
          onClick={() => setSlotsOpen(true)}
          aria-label="Исправить данные клиента"
          sx={styles.slotsButton}
        >
          <EditOutlinedIcon sx={styles.slotsIcon} />
        </IconButton>
      </Stack>

      {patchError && (
        <Alert severity="error" sx={styles.panelError}>
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
      <SlotsDialog
        open={slotsOpen}
        onClose={() => setSlotsOpen(false)}
        accountId={accountId}
        chatId={chatId}
        current={data}
      />
    </Box>
  )
}

/** Одна строка «что бот знает о клиенте»: заполненные слоты и прочерки вместо пустых. */
function describeSlots(data: ChatAiStateDto): string {
  const slots = data.slots
  const birth = slots.birthDate
    ? `ДР ${slots.birthDate}${slots.age !== null ? ` (${slots.age})` : ''}`
    : slots.birthDateText
      ? `ДР «${slots.birthDateText}»`
      : 'ДР —'
  const gender = slots.gender === 'f' ? 'жен.' : slots.gender === 'm' ? 'муж.' : 'пол —'

  const parts = [
    birth,
    slots.birthPlace ? `место ${slots.birthPlace}` : 'место —',
    gender,
    `язык ${slots.language}`,
    slots.requestSummary ? `запрос: ${slots.requestSummary}` : 'запрос —',
  ]
  if (slots.requestCategoryKey) parts.push(`категория ${slots.requestCategoryKey}`)
  if (slots.openThreads.length > 0) parts.push(`открыто: ${slots.openThreads.join('; ')}`)
  if (slots.facts.length > 0) parts.push(`о клиенте: ${slots.facts.join('; ')}`)
  return parts.join(' · ')
}

const SLOT_LABELS: Record<string, string> = {
  birthDate: 'дата рождения',
  birthDateText: 'дата рождения (словами)',
  birthPlace: 'место рождения',
  gender: 'пол',
  language: 'язык',
  requestSummary: 'запрос',
  requestCategoryKey: 'категория',
  minorHint: 'несовершеннолетний',
}

/** Подсказка «откуда бот это взял»: источник поля и слова клиента, на которых вывод. */
function describeSources(data: ChatAiStateDto): string {
  const entries = Object.entries(data.slots.sources)
  if (entries.length === 0) return 'Бот пока ничего не выяснил сам'
  return entries
    .map(([field, meta]) => {
      const who = meta.source === 'manager' ? 'менеджер' : 'бот'
      const why = meta.evidence ? `: «${meta.evidence}»` : ''
      return `${SLOT_LABELS[field] ?? field} — ${who}${why}`
    })
    .join('\n')
}
