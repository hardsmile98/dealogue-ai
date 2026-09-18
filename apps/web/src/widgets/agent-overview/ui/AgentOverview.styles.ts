import type { SxStyles } from '@/shared/types'

export const agentOverviewStyles = {
  row: {
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowValue: {
    fontWeight: 600,
  },
  compactList: {
    fontSize: 13,
  },
  note: {
    display: 'block',
    mt: 1,
  },
  touch: {
    alignItems: 'center',
    fontSize: 13,
  },
  touchLink: {
    minWidth: 0,
  },
  spacer: {
    flexGrow: 1,
  },
  check: {
    alignItems: 'flex-start',
  },
} satisfies SxStyles
