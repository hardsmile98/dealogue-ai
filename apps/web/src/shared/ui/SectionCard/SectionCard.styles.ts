import type { SxStyles } from '@/shared/types';

export const sectionCardStyles = {
  fullHeight: {
    height: '100%',
  },
  header: {
    alignItems: 'flex-start',
    mb: 2,
  },
  heading: {
    flexGrow: 1,
    minWidth: 0,
  },
  subtitle: {
    color: 'text.secondary',
    mt: 0.25,
  },
} satisfies SxStyles;
