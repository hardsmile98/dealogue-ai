import { useEffect, useRef } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { formatAhead, formatDateTime, formatTime } from '@/shared/lib'
import type { SimEvent } from '@/shared/api'
import { FUNNEL_STAGE_META, TOUCH_KIND_META } from '@/entities/ai-agent'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'
import { SandboxTurnDetails } from './SandboxTurnDetails'
import { agentSandboxStyles as styles } from './AgentSandbox.styles'

interface SandboxTimelineProps {
  events: SimEvent[]
  /** Шаг ещё выполняется — внизу ленты крутится ожидание ответа модели. */
  busy: boolean
}

/** Служебная строка про касание: сработало, запланировано, перенесено, снято. */
function touchLine(event: Extract<SimEvent, { kind: 'touch' }>): string {
  const name = event.touchKind ? TOUCH_KIND_META[event.touchKind] : ''
  const when = event.touchAt ? `${formatDateTime(event.touchAt)}, ${formatAhead(event.touchAt, event.at)}` : ''
  switch (event.state) {
    case 'fired':
      return `Сработало касание «${name}»`
    case 'planned':
      return `Следующее касание «${name}» — ${when}`
    case 'postponed':
      return `Касание «${name}» перенесено на ${when}`
    default:
      return 'Касаний больше не запланировано — бот ждёт клиента'
  }
}

/** Лента песочницы: реплики, ходы бота и служебные события — как в чате. */
export function SandboxTimeline({ events, busy }: SandboxTimelineProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (node) node.scrollTop = node.scrollHeight
  }, [events, busy])

  return (
    <Box ref={ref} sx={styles.timeline}>
      {events.map((event, index) => {
        const key = `${index}:${event.kind}`
        switch (event.kind) {
          case 'client':
            return (
              <Box key={key} sx={[styles.bubbleRow, styles.bubbleRowClient]}>
                <Box sx={[styles.bubble, styles.bubbleClient]}>{event.text}</Box>
                <Box sx={styles.bubbleMeta}>клиент · {formatTime(event.at)}</Box>
              </Box>
            )
          case 'bot':
            return (
              <Box key={key} sx={[styles.bubbleRow, styles.bubbleRowBot]}>
                {event.messages.map((message, messageIndex) => (
                  <Box key={messageIndex} sx={[styles.bubble, styles.bubbleBot]}>
                    {message.blockKind && (
                      <Chip size="small" variant="outlined" label={`блок ${message.blockKind}`} sx={styles.blockBadge} />
                    )}
                    <Box>{message.text}</Box>
                  </Box>
                ))}
                <Box sx={styles.bubbleMeta}>бот · {formatTime(event.at)}</Box>
                <SandboxTurnDetails turn={event.turn} />
              </Box>
            )
          case 'silent':
            return (
              <Box key={key} sx={styles.systemStrong}>
                <Typography sx={styles.systemLine}>Бот решил промолчать: {event.text}</Typography>
                <SandboxTurnDetails turn={event.turn} />
              </Box>
            )
          case 'handoff':
            return (
              <Box key={key} sx={styles.systemStrong}>
                <Alert severity="warning" sx={styles.alert}>
                  <strong>Чат передан менеджеру: {HANDOFF_REASON_LABELS[event.reason] ?? event.reason}.</strong>{' '}
                  {event.text}
                </Alert>
                {event.turn && <SandboxTurnDetails turn={event.turn} />}
              </Box>
            )
          case 'skip':
            return (
              <Typography key={key} sx={styles.systemLine}>
                {event.text}
              </Typography>
            )
          case 'stage':
            return (
              <Chip
                key={key}
                size="small"
                variant="outlined"
                sx={styles.systemStrong}
                label={`Этап: ${FUNNEL_STAGE_META[event.from].label} → ${FUNNEL_STAGE_META[event.to].label}`}
              />
            )
          case 'touch':
            return (
              <Typography key={key} sx={styles.systemLine}>
                {touchLine(event)}
              </Typography>
            )
          default:
            return (
              <Typography key={key} sx={styles.systemLine}>
                {event.text}
              </Typography>
            )
        }
      })}
      {busy && (
        <Box sx={styles.systemStrong}>
          <Typography sx={styles.systemLine}>
            <CircularProgress size={12} sx={{ mr: 1 }} />
            бот думает…
          </Typography>
        </Box>
      )}
    </Box>
  )
}
