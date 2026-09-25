import { useState } from 'react'
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { JOB_KIND_LABELS, STAGE_LABELS } from '@/shared/api'
import type { BotMemoryDto, BotTurnDto, SandboxJobDto, Stage } from '@/shared/api'
import { formatDateTime, formatTime } from '@/shared/lib'
import { CARD_LABELS, JOB_STATUS_LABELS, TOPIC_LABELS, TRIGGER_LABELS, TURN_STATUS_LABELS } from '../lib/labels'
import { journalStyles as styles } from './journal.styles'

/*
 * Журнал агента — общий для песочницы и реального чата: ход (что понял
 * анализатор, что решил план, что поправили проверки), память о клиенте,
 * задания лестницы молчания.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Typography sx={styles.sectionTitle}>{title}</Typography>
      {children}
    </Box>
  )
}

/** Один ход журнала: что понял анализатор, что решил план, что поправили проверки. */
export function TurnCard({ turn, defaultOpen }: { turn: BotTurnDto; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const status = TURN_STATUS_LABELS[turn.status] ?? { label: turn.status, color: 'default' as const }
  const violations = turn.review?.violations ?? []

  return (
    <Box sx={styles.turnCard}>
      <Box sx={styles.turnHeader} onClick={() => setOpen((value) => !value)}>
        <Typography sx={styles.turnTitle}>
          {TRIGGER_LABELS[turn.trigger] ?? turn.trigger}
          <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary', ml: 1 }}>
            {formatTime(turn.startedAt)}
          </Box>
        </Typography>
        {turn.review?.rewritten && <Chip size="small" variant="outlined" label="переписан" />}
        {turn.final?.fallback && <Chip size="small" variant="outlined" color="warning" label="запасной" />}
        <Chip size="small" color={status.color} label={status.label} />
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Box>

      {turn.error && <Typography sx={[styles.small, { color: turn.status === 'failed' ? 'error.main' : 'text.secondary' }]}>{turn.error}</Typography>}

      {open && (
        <>
          {turn.analysis && (
            <Section title="Анализ">
              <Box sx={styles.tagRow}>
                {turn.analysis.intents.map((intent) => (
                  <Chip key={intent} size="small" label={intent} />
                ))}
                {turn.analysis.risk.map((risk) => (
                  <Chip key={risk} size="small" color="error" label={risk} />
                ))}
                {turn.analysis.objection && <Chip size="small" color="warning" label={`возражение: ${turn.analysis.objection}`} />}
                <Chip size="small" variant="outlined" label={`интерес ${turn.analysis.interest}/3`} />
                {turn.analysis.language && <Chip size="small" variant="outlined" label={turn.analysis.language} />}
              </Box>
              {turn.analysis.answerPoints.length > 0 && (
                <Box component="ul" sx={[styles.small, { pl: 2.5, my: 0.75 }]}>
                  {turn.analysis.answerPoints.map((point, index) => (
                    <li key={index} style={{ opacity: point.skip ? 0.5 : 1 }}>
                      <b>{TOPIC_LABELS[point.topic] ?? point.topic}:</b> {point.text}
                    </li>
                  ))}
                </Box>
              )}
            </Section>
          )}

          {turn.plan && (
            <Section title="План">
              <Box sx={styles.tagRow}>
                {turn.plan.milestone && <Chip size="small" color="secondary" label={`веха: ${turn.plan.milestone}`} />}
                {turn.plan.nudge && <Chip size="small" variant="outlined" label={`шаг: ${turn.plan.nudge}`} />}
                {turn.plan.handoff && <Chip size="small" color="warning" label={`менеджеру: ${turn.plan.handoff}`} />}
              </Box>
              <Box sx={[styles.pre, { mt: 0.75 }]}>{turn.plan.goal}</Box>
            </Section>
          )}

          {violations.length > 0 && (
            <Section title="Проверяющий">
              {violations.map((violation, index) => (
                <Typography key={index} sx={styles.small}>
                  <b>{violation.code}</b> ({violation.severity === 'hard' ? 'грубое' : 'стиль'}): {violation.detail}
                </Typography>
              ))}
              {turn.review?.final && turn.review.final.length > 0 && (
                <Typography sx={[styles.small, { color: 'warning.main' }]}>
                  После правки осталось: {turn.review.final.map((violation) => violation.code).join(', ')}
                </Typography>
              )}
            </Section>
          )}

          {turn.final && turn.final.removed.length > 0 && (
            <Section title="Вырезано проверками">
              {turn.final.removed.map((item, index) => (
                <Typography key={index} sx={styles.small}>
                  <b>{item.reason}:</b> {item.part.slice(0, 160)}
                </Typography>
              ))}
            </Section>
          )}

          {turn.draft && turn.review?.rewritten && (
            <Section title="Итоговый черновик">
              <Box sx={styles.pre}>{turn.draft}</Box>
            </Section>
          )}
        </>
      )}
    </Box>
  )
}

export function MemoryView({ memory }: { memory: BotMemoryDto }) {
  const card = Object.entries(memory.card).flatMap(([key, raw]) => {
    const field = raw as { value?: unknown; confidence?: number } | null
    if (!field || field.value === undefined) return []
    const confidence = typeof field.confidence === 'number' && field.confidence < 1 ? ` (${Math.round(field.confidence * 100)}%)` : ''
    return [{ key, label: CARD_LABELS[key] ?? key, value: `${String(field.value)}${confidence}` }]
  })
  const milestones = memory.said.filter((entry) => entry.kind === 'milestone')
  const other = memory.said.filter((entry) => entry.kind !== 'milestone')

  return (
    <>
      <Section title="Карточка">
        {card.length === 0 ? (
          <Typography sx={styles.small} color="text.secondary">
            Пока ничего не известно.
          </Typography>
        ) : (
          card.map((field) => (
            <Box key={field.key} sx={styles.factRow}>
              <Box sx={styles.factKind}>{field.label}</Box>
              <span>{field.value}</span>
            </Box>
          ))
        )}
      </Section>
      <Section title="Резюме">
        <Typography sx={styles.small}>{memory.summary || '—'}</Typography>
      </Section>
      <Section title="Факты">
        {memory.facts.length === 0 ? (
          <Typography sx={styles.small} color="text.secondary">
            —
          </Typography>
        ) : (
          memory.facts.map((fact, index) => (
            <Box key={index} sx={styles.factRow}>
              <Box sx={styles.factKind}>{fact.kind}</Box>
              <span>
                {fact.text}
                {fact.confidence < 0.8 ? ' (не точно)' : ''}
              </span>
            </Box>
          ))
        )}
      </Section>
      <Section title="Вехи">
        {milestones.length === 0 ? (
          <Typography sx={styles.small} color="text.secondary">
            Ещё не было.
          </Typography>
        ) : (
          milestones.map((entry, index) => (
            <Box key={index} sx={styles.factRow}>
              <Box sx={styles.factKind}>{formatDateTime(entry.at)}</Box>
              <span>{STAGE_LABELS[entry.key as Stage] ?? entry.key}</span>
            </Box>
          ))
        )}
      </Section>
      <Section title="Сказано">
        <Box sx={styles.tagRow}>
          {other.length === 0 && (
            <Typography sx={styles.small} color="text.secondary">
              —
            </Typography>
          )}
          {other.map((entry, index) => (
            <Chip key={index} size="small" variant="outlined" label={`${entry.kind}: ${entry.key}`} />
          ))}
        </Box>
        <Typography sx={[styles.small, { mt: 0.75 }]} color="text.secondary">
          Ходов без шага воронки: {memory.turnsWithoutNudge} · напоминаний: {memory.remindersSent}
        </Typography>
      </Section>
    </>
  )
}

export function JobsView({ jobs }: { jobs: SandboxJobDto[] }) {
  if (jobs.length === 0) {
    return (
      <Typography sx={styles.small} color="text.secondary">
        Заданий нет. Их ставит лестница молчания: после каждого хода и каждого «прочитано» она выбирает следующую
        ступень этапа — напоминание, вопрос-отклик, веху по таймеру.
      </Typography>
    )
  }
  return (
    <>
      {jobs.map((job) => (
        <Box key={job.id} sx={styles.factRow}>
          <Box sx={styles.factKind}>{formatDateTime(job.runAt)}</Box>
          <span style={{ opacity: job.status === 'pending' ? 1 : 0.55 }}>
            {JOB_KIND_LABELS[job.kind] ?? job.kind} — {JOB_STATUS_LABELS[job.status] ?? job.status}
            {job.note && (
              <Box component="span" sx={{ display: 'block', fontSize: 12, color: 'text.secondary' }}>
                {job.note}
              </Box>
            )}
          </span>
        </Box>
      ))}
    </>
  )
}
