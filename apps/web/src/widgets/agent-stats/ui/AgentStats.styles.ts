import type { SxStyles } from '@/shared/types'

export const agentStatsStyles = {
  periodBar: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 1,
  },
  line: {
    justifyContent: 'space-between',
  },
  note: {
    display: 'block',
    mt: 1,
  },
  subSection: {
    mt: 1.5,
  },
  subList: {
    mt: 0.5,
  },
  secondTable: {
    mt: 2,
  },
  itemKind: {
    display: 'block',
  },
} satisfies SxStyles
