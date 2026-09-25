import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { journalStyles as styles } from './journal.styles';

/** Подраздел журнала: мелкий заголовок капсом и содержимое. */
export function JournalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box component="section" sx={styles.section}>
      <Typography component="h3" sx={styles.sectionTitle}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}
