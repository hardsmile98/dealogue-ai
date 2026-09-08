import type { SxStyles } from '@/shared/types'

export const accountPageStyles = {
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    fontSize: 13,
    fontWeight: 500,
    color: 'text.secondary',
    textDecoration: 'none',
    mb: 1.5,
    '&:hover': { color: 'primary.main' },
    '& svg': { fontSize: 16 },
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    flexWrap: 'wrap',
  },
  meta: {
    color: 'text.secondary',
    mt: 0.5,
  },
  statusAlert: {
    mb: 3,
    borderRadius: 2,
  },
  tabs: {
    mb: 3,
    borderBottom: '1px solid',
    borderColor: 'divider',
    '& .MuiTab-root': {
      minHeight: 44,
      fontWeight: 600,
    },
  },
  tabLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 1,
  },
} satisfies SxStyles
