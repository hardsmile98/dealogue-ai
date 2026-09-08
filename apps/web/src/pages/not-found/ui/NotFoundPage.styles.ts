import type { SxStyles } from '@/shared/types'

export const notFoundPageStyles = {
  root: {
    minHeight: '100dvh',
    display: 'grid',
    placeItems: 'center',
    p: 2,
    bgcolor: 'background.default',
  },
  content: {
    alignItems: 'center',
    textAlign: 'center',
  },
  code: {
    fontWeight: 700,
    color: 'text.secondary',
  },
} satisfies SxStyles
