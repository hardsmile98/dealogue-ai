import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { SxStyles } from '@/shared/types'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  /** compact — для пустых панелей внутри страницы, не на всю высоту. */
  size?: 'default' | 'compact'
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 1,
    px: 3,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    display: 'grid',
    placeItems: 'center',
    bgcolor: 'action.hover',
    color: 'text.secondary',
    mb: 1,
    '& svg': { fontSize: 28 },
  },
  description: {
    color: 'text.secondary',
    maxWidth: 420,
  },
  action: {
    mt: 1.5,
  },
} satisfies SxStyles

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'default',
}: EmptyStateProps) {
  return (
    <Box sx={[styles.root, { py: size === 'compact' ? 4 : 8 }]}>
      {icon && <Box sx={styles.iconWrap}>{icon}</Box>}
      <Typography variant="h6">{title}</Typography>
      {description && (
        <Typography variant="body2" component="div" sx={styles.description}>
          {description}
        </Typography>
      )}
      {action && <Box sx={styles.action}>{action}</Box>}
    </Box>
  )
}
