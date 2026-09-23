import type { SxStyles } from '@/shared/types'

export const chatPanelStyles = {
  root: {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', md: '360px 1fr' },
    height: { xs: 'calc(100dvh - 240px)', md: 'calc(100dvh - 268px)' },
    minHeight: 520,
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 3,
    overflow: 'hidden',
    bgcolor: 'background.paper',
  },
  singleColumn: {
    gridTemplateColumns: '1fr',
  },
  emptyThread: {
    display: 'grid',
    placeItems: 'center',
    minHeight: 0,
    bgcolor: '#f7f7fb',
  },
} satisfies SxStyles
