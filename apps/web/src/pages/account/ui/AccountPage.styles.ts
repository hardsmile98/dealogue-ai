import type { SxStyles } from '@/shared/types';

export const accountPageStyles = {
  // Колонка на всю высоту контента: вкладки с панелями (чаты, песочница)
  // растягиваются до низа экрана.
  root: {
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 0.5,
    fontSize: 13,
    fontWeight: 500,
    color: 'text.secondary',
    textDecoration: 'none',
    borderRadius: '4px',
    mb: 1.5,
    '&:hover': { color: 'primary.main' },
    '&:focus-visible': {
      outline: '2px solid',
      outlineColor: 'primary.main',
      outlineOffset: '2px',
    },
    '& svg': { fontSize: 16 },
  },
  statusAlert: {
    mb: 3,
  },
  tabs: {
    mb: 3,
    borderBottom: '1px solid',
    borderColor: 'divider',
    flexShrink: 0,
  },
  tabLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 1,
  },
  headerSkeleton: {
    alignItems: 'center',
    mb: 3,
  },
  headerSkeletonText: {
    flexGrow: 1,
  },
  dangerItem: {
    color: 'error.main',
    '& .MuiListItemIcon-root': { color: 'inherit' },
  },
} satisfies SxStyles;
