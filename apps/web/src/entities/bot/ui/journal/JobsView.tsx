import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SandboxJobDto } from '@/shared/api';
import { formatDateTime } from '@/shared/lib';
import { JOB_STATUS_LABELS, jobKindLabel } from '../../lib/labels';
import { journalStyles as styles } from './journal.styles';

/** Задания планировщика: ступени лестницы молчания и повторы. */
export function JobsView({ jobs }: { jobs: SandboxJobDto[] }) {
  if (jobs.length === 0) {
    return (
      <Typography sx={styles.muted}>
        Заданий нет. Их ставит лестница молчания: после каждого хода и каждого
        «прочитано» она выбирает следующую ступень этапа — напоминание,
        вопрос-отклик, веху по таймеру.
      </Typography>
    );
  }

  return (
    <>
      {jobs.map((job) => (
        <Box key={job.id} sx={styles.factRow}>
          <Box sx={styles.factKind}>{formatDateTime(job.runAt)}</Box>
          <Box
            component="span"
            sx={job.status === 'pending' ? undefined : styles.inactiveJob}
          >
            {jobKindLabel(job.kind)} —{' '}
            {JOB_STATUS_LABELS[job.status] ?? job.status}
            {job.note && (
              <Box component="span" sx={styles.factNote}>
                {job.note}
              </Box>
            )}
          </Box>
        </Box>
      ))}
    </>
  );
}
