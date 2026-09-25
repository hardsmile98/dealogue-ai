import type { SxStyles } from '@/shared/types';

export const sandboxInspectorStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    bgcolor: 'background.paper',
  },
  side: {
    width: { lg: 360, xl: 400 },
    flexShrink: 0,
    borderLeft: '1px solid',
    borderColor: 'divider',
  },
  stacked: {
    flex: '1 1 0',
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    pr: 0.5,
    borderBottom: '1px solid',
    borderColor: 'divider',
  },
  tabs: {
    flexGrow: 1,
    minWidth: 0,
  },
  body: {
    overflowY: 'auto',
    flexGrow: 1,
    p: 1.5,
    display: 'flex',
    flexDirection: 'column',
    gap: 1.5,
  },
  // Свёрнутая панель: столбик иконок справа или строка в шапке диалога.
  rail: {
    width: 52,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0.5,
    py: 1,
    bgcolor: 'background.paper',
    borderLeft: '1px solid',
    borderColor: 'divider',
  },
  railInline: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    mr: -0.75,
  },
  railBadge: {
    '& .MuiBadge-badge': { fontSize: 10, height: 16, minWidth: 16, px: 0.5 },
  },
} satisfies SxStyles;
