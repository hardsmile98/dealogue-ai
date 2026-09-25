import type { SxStyles } from '@/shared/types';

export const accountHandoffsStyles = {
  group: {
    '& + &': { mt: 2.5 },
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'text.secondary',
    mb: 0.5,
  },
  list: {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    overflow: 'hidden',
    '& > li + li': { borderTop: '1px solid', borderColor: 'divider' },
  },
  item: {
    alignItems: 'flex-start',
    gap: 1.5,
    py: 1.25,
  },
  text: {
    minWidth: 0,
    flexGrow: 1,
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 1,
  },
  name: {
    fontWeight: 600,
    fontSize: 14,
  },
  last: {
    fontSize: 13,
    color: 'text.secondary',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    mt: 0.25,
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 0.75,
    alignItems: 'center',
    mt: 0.75,
    fontSize: 12,
    color: 'text.secondary',
  },
  waiting: {
    color: 'warning.dark',
    fontWeight: 500,
  },
} satisfies SxStyles;
