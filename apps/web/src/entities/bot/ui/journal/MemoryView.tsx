import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type { BotMemoryDto, Stage } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { STAGE_LABELS } from '../../lib/labels';
import { CONFIDENT_FACT, readCard, splitSaid } from '../../lib/memory';
import { JournalSection } from './JournalSection';
import { journalStyles as styles } from './journal.styles';

/** Память о клиенте: карточка, резюме, факты, доставленные вехи, сказанное. */
export function MemoryView({ memory }: { memory: BotMemoryDto }) {
  const card = readCard(memory.card);
  const { milestones, other } = splitSaid(memory.said);

  return (
    <>
      <JournalSection title="Карточка">
        {card.length === 0 ? (
          <Typography sx={styles.muted}>Пока ничего не известно.</Typography>
        ) : (
          card.map((field) => (
            <Box key={field.key} sx={styles.factRow}>
              <Box sx={styles.factKind}>{field.label}</Box>
              <span>{field.value}</span>
            </Box>
          ))
        )}
      </JournalSection>

      <JournalSection title="Резюме">
        <Typography sx={memory.summary ? styles.small : styles.muted}>
          {memory.summary || 'Резюме ещё не составлено.'}
        </Typography>
      </JournalSection>

      <JournalSection title="Факты">
        {memory.facts.length === 0 ? (
          <Typography sx={styles.muted}>Фактов пока нет.</Typography>
        ) : (
          memory.facts.map((fact, index) => (
            <Box key={index} sx={styles.factRow}>
              <Box sx={styles.factKind}>{fact.kind}</Box>
              <span>
                {fact.text}
                {fact.confidence < CONFIDENT_FACT ? ' (не точно)' : ''}
              </span>
            </Box>
          ))
        )}
      </JournalSection>

      <JournalSection title="Вехи">
        {milestones.length === 0 ? (
          <Typography sx={styles.muted}>Ещё не было.</Typography>
        ) : (
          milestones.map((entry, index) => (
            <Box key={index} sx={styles.factRow}>
              <Box sx={styles.factKind}>{formatDateTime(entry.at)}</Box>
              <span>{STAGE_LABELS[entry.key as Stage] ?? entry.key}</span>
            </Box>
          ))
        )}
      </JournalSection>

      <JournalSection title="Сказано">
        {other.length === 0 ? (
          <Typography sx={styles.muted}>Пока ничего.</Typography>
        ) : (
          <Box sx={styles.tagRow}>
            {other.map((entry, index) => (
              <Chip
                key={index}
                size="small"
                variant="outlined"
                label={`${entry.kind}: ${entry.key}`}
              />
            ))}
          </Box>
        )}
        <Typography sx={styles.muted}>
          Ходов без шага воронки: {memory.turnsWithoutNudge} · напоминаний:{' '}
          {memory.remindersSent}
        </Typography>
      </JournalSection>
    </>
  );
}
