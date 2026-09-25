import type { SxStyles } from '@/shared/types';

export const sandboxSessionStyles = {
  root: {
    display: 'flex',
    minHeight: 0,
    minWidth: 0,
  },
  dialog: {
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    bgcolor: 'background.subtle',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    px: 2,
    py: 1.25,
    bgcolor: 'background.paper',
    borderBottom: '1px solid',
    borderColor: 'divider',
  },
  backButton: {
    ml: -0.75,
  },
  headerText: {
    minWidth: 0,
    flexGrow: 1,
  },
  title: {
    fontWeight: 600,
    fontSize: 15,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 0.75,
    mt: 0.5,
    fontSize: 12,
    color: 'text.secondary',
  },
  clock: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    '& svg': { fontSize: 16 },
  },
  clockLabel: {
    display: { xs: 'none', sm: 'inline' },
  },
  skeleton: {
    p: 2,
    gap: 1.5,
  },
  skeletonOut: {
    alignSelf: 'flex-end',
  },
  progressSlot: {
    height: 4,
    flexShrink: 0,
  },
  chat: {
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  hidden: {
    display: 'none',
  },
  missing: {
    display: 'grid',
    placeItems: 'center',
    bgcolor: 'background.subtle',
    p: 3,
  },
} satisfies SxStyles;
