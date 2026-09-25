import type { SxStyles } from '@/shared/types';

export const emptyStateStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 1,
    px: 3,
    py: 8,
  },
  compact: {
    py: 4,
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
  title: {
    fontSize: { xs: 17, sm: 18 },
  },
  description: {
    color: 'text.secondary',
    maxWidth: 440,
  },
  action: {
    mt: 1.5,
  },
} satisfies SxStyles;
