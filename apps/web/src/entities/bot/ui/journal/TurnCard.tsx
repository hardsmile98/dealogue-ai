import { useId, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type {
  BotTurnDto,
  TurnAnalysisDto,
  TurnFinalDto,
  TurnPlanDto,
  TurnReviewDto,
} from '@/shared/api';
import { formatTime } from '@/shared/lib';
import {
  TOPIC_LABELS,
  TRIGGER_LABELS,
  TURN_STATUS_LABELS,
} from '../../lib/labels';
import { JournalSection } from './JournalSection';
import { journalStyles as styles } from './journal.styles';

/** Сколько символов вырезанного куска показывать — дальше он неинтересен. */
const REMOVED_PREVIEW_LENGTH = 160;

interface TurnCardProps {
  turn: BotTurnDto;
  defaultOpen: boolean;
}

/**
 * Один ход журнала: заголовок (что запустило, когда, чем кончилось)
 * раскрывается в подробности — что понял анализатор, что решил план,
 * что поправили проверки.
 */
export function TurnCard({ turn, defaultOpen }: TurnCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const status = TURN_STATUS_LABELS[turn.status] ?? {
    label: turn.status,
    color: 'default' as const,
  };

  return (
    <Box sx={styles.turnCard}>
      <ButtonBase
        component="div"
        sx={styles.turnHeader}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <Typography component="span" sx={styles.turnTitle}>
          {TRIGGER_LABELS[turn.trigger] ?? turn.trigger}
          <Box component="span" sx={styles.turnTime}>
            {formatTime(turn.startedAt)}
          </Box>
        </Typography>
        {turn.review?.rewritten && (
          <Chip size="small" variant="outlined" label="переписан" />
        )}
        {turn.final?.fallback && (
          <Chip
            size="small"
            variant="outlined"
            color="warning"
            label="запасной"
          />
        )}
        <Chip size="small" color={status.color} label={status.label} />
        {open ? (
          <ExpandLessIcon fontSize="small" />
        ) : (
          <ExpandMoreIcon fontSize="small" />
        )}
      </ButtonBase>

      {turn.error && (
        <Typography
          sx={[
            styles.turnError,
            {
              color: turn.status === 'failed' ? 'error.main' : 'text.secondary',
            },
          ]}
        >
          {turn.error}
        </Typography>
      )}

      {open && (
        <Box id={bodyId} sx={styles.turnBody}>
          {turn.analysis && <AnalysisSection analysis={turn.analysis} />}
          {turn.plan && <PlanSection plan={turn.plan} />}
          {turn.review && <ReviewSection review={turn.review} />}
          {turn.final && <RemovedSection final={turn.final} />}
          {turn.draft && turn.review?.rewritten && (
            <JournalSection title="Итоговый черновик">
              <Box sx={styles.pre}>{turn.draft}</Box>
            </JournalSection>
          )}
        </Box>
      )}
    </Box>
  );
}

function AnalysisSection({ analysis }: { analysis: TurnAnalysisDto }) {
  return (
    <JournalSection title="Анализ">
      <Box sx={styles.tagRow}>
        {analysis.intents.map((intent) => (
          <Chip key={intent} size="small" label={intent} />
        ))}
        {analysis.risk.map((risk) => (
          <Chip key={risk} size="small" color="error" label={risk} />
        ))}
        {analysis.objection && (
          <Chip
            size="small"
            color="warning"
            label={`возражение: ${analysis.objection}`}
          />
        )}
        <Chip
          size="small"
          variant="outlined"
          label={`интерес ${analysis.interest}/3`}
        />
        {analysis.language && (
          <Chip size="small" variant="outlined" label={analysis.language} />
        )}
      </Box>
      {analysis.answerPoints.length > 0 && (
        <Box component="ul" sx={styles.list}>
          {analysis.answerPoints.map((point, index) => (
            <Box
              component="li"
              key={index}
              sx={point.skip ? styles.skippedPoint : undefined}
            >
              <b>{TOPIC_LABELS[point.topic] ?? point.topic}:</b> {point.text}
            </Box>
          ))}
        </Box>
      )}
    </JournalSection>
  );
}

function PlanSection({ plan }: { plan: TurnPlanDto }) {
  return (
    <JournalSection title="План">
      {(plan.milestone || plan.nudge || plan.handoff) && (
        <Box sx={styles.tagRow}>
          {plan.milestone && (
            <Chip
              size="small"
              color="secondary"
              label={`веха: ${plan.milestone}`}
            />
          )}
          {plan.nudge && (
            <Chip
              size="small"
              variant="outlined"
              label={`шаг: ${plan.nudge}`}
            />
          )}
          {plan.handoff && (
            <Chip
              size="small"
              color="warning"
              label={`менеджеру: ${plan.handoff}`}
            />
          )}
        </Box>
      )}
      <Box sx={styles.pre}>{plan.goal}</Box>
    </JournalSection>
  );
}

function ReviewSection({ review }: { review: TurnReviewDto }) {
  if (review.violations.length === 0) return null;
  const remaining = review.final ?? [];

  return (
    <JournalSection title="Проверяющий">
      {review.violations.map((violation, index) => (
        <Typography key={index} sx={styles.small}>
          <b>{violation.code}</b> (
          {violation.severity === 'hard' ? 'грубое' : 'стиль'}):{' '}
          {violation.detail}
        </Typography>
      ))}
      {remaining.length > 0 && (
        <Typography sx={[styles.small, { color: 'warning.dark' }]}>
          После правки осталось:{' '}
          {remaining.map((violation) => violation.code).join(', ')}
        </Typography>
      )}
    </JournalSection>
  );
}

function RemovedSection({ final }: { final: TurnFinalDto }) {
  if (final.removed.length === 0) return null;

  return (
    <JournalSection title="Вырезано проверками">
      {final.removed.map((item, index) => (
        <Typography key={index} sx={styles.small}>
          <b>{item.reason}:</b> {item.part.slice(0, REMOVED_PREVIEW_LENGTH)}
        </Typography>
      ))}
    </JournalSection>
  );
}
