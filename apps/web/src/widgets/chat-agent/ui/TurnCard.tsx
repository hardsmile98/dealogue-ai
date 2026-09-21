import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { formatDateTime } from '@/shared/lib'
import type { TurnDto } from '@/shared/api'
import {
  FUNNEL_STAGE_META,
  TOUCH_KIND_META,
  TURN_OUTCOME_META,
  TURN_TRIGGER_LABELS,
} from '@/entities/ai-agent'
import { RateTurn } from './RateTurn'
import { chatAgentStyles as styles } from './ChatAgent.styles'

interface TurnCardProps {
  accountId: string
  chatId: string
  turn: TurnDto
}

/** Длинные черновики в журнале режем: он для просмотра, а не для чтения целиком. */
const MESSAGE_PREVIEW_LIMIT = 600

/** Один ход в журнале: что понял, что планировал отправить, что сказал guard. */
export function TurnCard({ accountId, chatId, turn }: TurnCardProps) {
  const outcome = TURN_OUTCOME_META[turn.outcome]
  const analysis = turn.analysis ?? {}
  const guardHits = turn.guardNotes.flatMap((note) => (note.violations as { detail: string }[] | undefined) ?? [])
  const fixes = turn.guardNotes.flatMap((note) => (note.fixes as string[] | undefined) ?? [])
  const guardSummary = [...fixes, ...guardHits.map((hit) => hit.detail)].join('; ')
  const escalation = analysis.escalation as { reason?: string; note?: string } | null | undefined

  return (
    <Box sx={styles.turnCard}>
      <Stack direction="row" spacing={0.75} sx={styles.turnHeader}>
        <Chip size="small" color={outcome.color} label={outcome.label} />
        <Chip
          size="small"
          variant="outlined"
          label={turn.touchKind ? TOUCH_KIND_META[turn.touchKind] : TURN_TRIGGER_LABELS[turn.trigger]}
        />
        {turn.stageBefore && turn.stageAfter && (
          <Typography variant="caption" color="text.secondary">
            {FUNNEL_STAGE_META[turn.stageBefore].short}
            {turn.stageAfter !== turn.stageBefore ? ` → ${FUNNEL_STAGE_META[turn.stageAfter].short}` : ''}
          </Typography>
        )}
        {turn.similarCases > 0 && (
          <Chip
            size="small"
            variant="outlined"
            label={`похожих случаев: ${turn.similarCases}`}
            sx={styles.turnBadge}
          />
        )}
        {turn.repliedAt && (
          <Chip size="small" variant="outlined" color="success" label="клиент ответил" sx={styles.turnBadge} />
        )}
        <Box sx={styles.spacer} />
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(turn.createdAt)} · {turn.tokensIn + turn.tokensOut} ток. ·{' '}
          {(turn.durationMs / 1000).toFixed(1)} с
        </Typography>
        <RateTurn accountId={accountId} chatId={chatId} turn={turn} />
      </Stack>

      {typeof analysis.clientIntent === 'string' && analysis.clientIntent && (
        <Typography variant="body2" sx={styles.turnLine}>
          <strong>Понял:</strong> {analysis.clientIntent}
          {typeof analysis.confidence === 'number' && ` (уверенность ${analysis.confidence.toFixed(2)})`}
        </Typography>
      )}
      {typeof analysis.replyPlan === 'string' && analysis.replyPlan && (
        <Typography variant="body2" sx={styles.turnLine}>
          <strong>План:</strong> {analysis.replyPlan}
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
        <Box sx={styles.turnLine}>
          <Typography variant="caption" color="text.secondary">
            {turn.messagesSent.length > 0
              ? `Ушло ${turn.messagesSent.length} из ${turn.messagesPlanned.length}`
              : `Планировалось ${turn.messagesPlanned.length}`}
          </Typography>
          <Stack spacing={0.5} sx={styles.turnMessages}>
            {turn.messagesPlanned.map((message, index) => (
              <Box key={index} sx={styles.turnMessage}>
                {message.blockId && (
                  <Chip size="small" variant="outlined" label="блок" sx={styles.turnMessageBadge} />
                )}
                {message.text.length > MESSAGE_PREVIEW_LIMIT
                  ? `${message.text.slice(0, MESSAGE_PREVIEW_LIMIT)}…`
                  : message.text}
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {guardSummary && (
        <Typography variant="caption" color="text.secondary" sx={styles.turnGuard}>
          Guard: {guardSummary}
        </Typography>
      )}
    </Box>
  )
}
