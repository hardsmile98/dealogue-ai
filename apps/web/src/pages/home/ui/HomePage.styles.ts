import type { SxStyles } from '@/shared/types'

export const homePageStyles = {
  root: {
    minHeight: '100dvh',
    display: 'grid',
    placeItems: 'center',
    p: 2,
    bgcolor: 'background.default',
  },
  card: {
    p: 4,
    maxWidth: 420,
    width: '100%',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 3,
  },
  content: {
    alignItems: 'center',
    textAlign: 'center',
  },
  avatar: {
    bgcolor: 'primary.main',
    width: 56,
    height: 56,
  },
} satisfies SxStyles
