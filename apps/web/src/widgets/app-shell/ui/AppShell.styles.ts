import type { SxStyles } from '@/shared/types'

export const SIDEBAR_WIDTH = 256

export const appShellStyles = {
  root: {
    display: 'flex',
    minHeight: '100dvh',
    bgcolor: 'background.default',
  },
  drawerPaper: {
    width: SIDEBAR_WIDTH,
    boxSizing: 'border-box',
    borderRight: '1px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    display: 'flex',
    flexDirection: 'column',
  },
  brand: {
    alignItems: 'center',
    px: 2.5,
    py: 2.5,
  },
  brandMark: {
    width: 36,
    height: 36,
  },
  brandName: {
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  nav: {
    px: 1.5,
    flexGrow: 1,
  },
  navSectionLabel: {
    px: 1.5,
    pt: 1,
    pb: 0.5,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'text.secondary',
  },
  navItem: {
    borderRadius: 2,
    mb: 0.5,
    '&.Mui-selected': {
      bgcolor: 'rgba(79, 70, 229, 0.08)',
      color: 'primary.main',
      '& .MuiListItemIcon-root': { color: 'primary.main' },
      '&:hover': { bgcolor: 'rgba(79, 70, 229, 0.12)' },
    },
  },
  navIcon: {
    minWidth: 36,
  },
  user: {
    alignItems: 'center',
    px: 2,
    py: 2,
    borderTop: '1px solid',
    borderColor: 'divider',
  },
  userText: {
    minWidth: 0,
    flexGrow: 1,
  },
  userName: {
    fontWeight: 600,
    fontSize: 14,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  userLogin: {
    fontSize: 12,
    color: 'text.secondary',
  },
  main: {
    flexGrow: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  mobileBar: {
    display: { xs: 'flex', md: 'none' },
    bgcolor: 'background.paper',
    color: 'text.primary',
    borderBottom: '1px solid',
    borderColor: 'divider',
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 1280,
    mx: 'auto',
    px: { xs: 2, sm: 3, lg: 4 },
    py: { xs: 2.5, md: 4 },
  },
} satisfies SxStyles
