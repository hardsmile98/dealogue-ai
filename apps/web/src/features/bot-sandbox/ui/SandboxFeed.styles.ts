import type { SxStyles } from '@/shared/types';

export const sandboxFeedStyles = {
  feed: {
    flexGrow: 1,
    overflowY: 'auto',
    py: 1.5,
  },
  empty: {
    px: 3,
    py: 6,
    textAlign: 'center',
    color: 'text.secondary',
    fontSize: 14,
    maxWidth: 480,
    mx: 'auto',
  },
  milestoneBadge: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'chat.milestoneText',
  },
  collapsed: {
    maxHeight: 132,
    overflow: 'hidden',
    maskImage: 'linear-gradient(to bottom, black 70%, transparent)',
  },
  expand: {
    mt: 0.25,
    p: 0,
    minWidth: 0,
    fontSize: 12,
  },
} satisfies SxStyles;
