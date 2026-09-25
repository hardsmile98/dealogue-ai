import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { emptyStateStyles as styles } from './EmptyState.styles';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** compact — для пустых панелей внутри страницы, не на всю высоту. */
  size?: 'default' | 'compact';
}

/** Пустое место с объяснением, почему пусто, и что сделать дальше. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'default',
}: EmptyStateProps) {
  return (
    <Box sx={[styles.root, size === 'compact' && styles.compact]}>
      {icon && <Box sx={styles.iconWrap}>{icon}</Box>}
      <Typography variant="h6" component="p" sx={styles.title}>
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" component="div" sx={styles.description}>
          {description}
        </Typography>
      )}
      {action && <Box sx={styles.action}>{action}</Box>}
    </Box>
  );
}
