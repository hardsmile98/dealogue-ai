import type { SxStyles } from '@/shared/types'

export const draftCardStyles = {
  root: {
    mt: 1,
    p: 1.5,
    borderRadius: 2,
    border: '1px solid',
  },
  header: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 0.5,
    mb: 1,
  },
  block: {
    mb: 1,
  },
  actions: {
    mt: 1,
    flexWrap: 'wrap',
    gap: 1,
  },
  spacer: {
    flexGrow: 1,
  },
  error: {
    mt: 1,
  },
  toggle: {
    px: 0,
    minWidth: 0,
  },
  casesList: {
    mt: 0.5,
  },
  case: {
    pl: 1,
    borderLeft: '2px solid',
    borderColor: 'divider',
  },
  caseMeta: {
    display: 'block',
  },
} satisfies SxStyles
