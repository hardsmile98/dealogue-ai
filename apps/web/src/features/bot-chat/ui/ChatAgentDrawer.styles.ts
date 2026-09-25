import type { SxStyles } from '@/shared/types';

export const chatAgentDrawerStyles = {
  paper: {
    width: { xs: '100%', sm: 440 },
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    px: 2,
    py: 1.5,
    borderBottom: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    flexGrow: 1,
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 0.75,
    alignItems: 'center',
  },
  reason: {
    color: 'text.secondary',
  },
  actions: {
    pt: 0.5,
  },
  tabs: {
    borderBottom: '1px solid',
    borderColor: 'divider',
  },
  body: {
    p: 2,
    overflowY: 'auto',
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1.5,
  },
} satisfies SxStyles;
