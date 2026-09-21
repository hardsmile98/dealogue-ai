import type { ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { formatAhead, formatDateTime } from '@/shared/lib'
import { SectionCard } from '@/shared/ui'
import type { SimState } from '@/shared/api'
import { FUNNEL_STAGE_META, TOUCH_KIND_META } from '@/entities/ai-agent'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'
import { agentSandboxStyles as styles } from './AgentSandbox.styles'

interface SandboxStateProps {
  state: SimState
  onResume: () => void
  busy: boolean
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box sx={styles.stateLine}>
      <Box sx={styles.stateLabel}>{label}</Box>
      <Box sx={styles.stateValue}>{value}</Box>
    </Box>
  )
}

const GENDER_LABELS: Record<string, string> = { f: 'женский', m: 'мужской' }

/** Состояние воронки песочницы: то же, что менеджер видит в шапке чата. */
export function SandboxState({ state, onResume, busy }: SandboxStateProps) {
  const card = state.card
  const dash = '—'

  return (
    <SectionCard title="Что бот знает и что будет дальше" subtitle="Состояние воронки этого выдуманного чата.">
      {state.handoff && (
        <Alert
          severity="warning"
          sx={styles.startHint}
          action={
            <Button color="inherit" size="small" loading={busy} onClick={onResume}>
              Вернуть боту
            </Button>
          }
        >
          <strong>{HANDOFF_REASON_LABELS[state.handoff.reason] ?? state.handoff.reason}.</strong> {state.handoff.detail}
        </Alert>
      )}

      <Line label="Этап" value={<Chip size="small" label={FUNNEL_STAGE_META[state.stage].label} />} />
      <Line label="Время в песочнице" value={formatDateTime(state.now)} />
      <Line
        label="Ближайшее касание"
        value={
          state.nextTouchKind && state.nextTouchAt
            ? `${TOUCH_KIND_META[state.nextTouchKind]} · ${formatAhead(state.nextTouchAt, state.now)}`
            : 'не запланировано'
        }
      />

      <Typography sx={styles.stateGroup}>Карточка клиента</Typography>
      <Line label="Дата рождения" value={card.birthDate ?? card.birthDateText ?? dash} />
      <Line label="Место рождения" value={card.birthPlace ?? dash} />
      <Line label="Пол" value={card.gender ? GENDER_LABELS[card.gender] : dash} />
      <Line label="Язык" value={card.language} />
      <Line label="Запрос" value={card.requestSummary ?? dash} />
      <Line label="Категория" value={card.requestCategoryKey ?? dash} />
      {card.openThreads.length > 0 && <Line label="Открытые нитки" value={card.openThreads.join('; ')} />}
      {card.facts.length > 0 && <Line label="О клиенте" value={card.facts.join('; ')} />}

      <Typography sx={styles.stateGroup}>Счётчики</Typography>
      <Line label="Ходов сделано" value={state.turnCount} />
      <Line label="Сообщений бота подряд" value={state.autoMessagesSinceClient} />
      <Line label="Напоминаний отправлено" value={state.remindersSent} />
      <Line label="Переносов касания" value={state.touchPostponedCount} />
      <Line label="Блоков уже ушло" value={state.sentBlockIds.length} />
      <Line
        label="Диагностика"
        value={
          state.diagnosticsSentAt
            ? `${formatDateTime(state.diagnosticsSentAt)}${state.diagnosticsReadAt ? ' · прочитана' : ' · не прочитана'}`
            : 'не отправлена'
        }
      />
    </SectionCard>
  )
}
