import type { SxStyles } from '@/shared/types'

export const brandMarkStyles = {
  root: {
    width: 44,
    height: 44,
    borderRadius: 2,
    display: 'grid',
    placeItems: 'center',
    bgcolor: 'primary.main',
    color: 'primary.contrastText',
    flexShrink: 0,
  },
} satisfies SxStyles
