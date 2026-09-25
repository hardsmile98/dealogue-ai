import type { SxStyles } from '@/shared/types';

export const queryBoundaryStyles = {
  empty: {
    color: 'text.secondary',
    textAlign: 'center',
    py: 3,
  },
  staleWarning: {
    mb: 2,
  },
} satisfies SxStyles;
