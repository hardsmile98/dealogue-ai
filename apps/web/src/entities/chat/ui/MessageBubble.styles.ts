import type { SxStyles } from '@/shared/types';

export const messageBubbleStyles = {
  mediaTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    fontSize: 12,
    fontWeight: 500,
    color: 'text.secondary',
    '& svg': { fontSize: 16 },
  },
  firstBadge: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 0.75,
  },
  firstBadgeLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'primary.main',
  },
} satisfies SxStyles;
