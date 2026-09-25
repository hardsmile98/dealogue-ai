import type { SxStyles } from '@/shared/types';

export const chatListStyles = {
  pane: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    // Меняется по брейкпоинту только ширина полосы — цвет всегда из темы.
    borderRightStyle: 'solid',
    borderRightWidth: { xs: 0, md: 1 },
    borderColor: 'divider',
  },
  tools: {
    p: 1.5,
    pb: 1,
    borderBottom: '1px solid',
    borderColor: 'divider',
  },
  filterRow: {
    display: 'flex',
    gap: 0.75,
    flexWrap: 'wrap',
    mt: 1,
  },
  /** Место под полоску перезапроса (поиск, обновление) — чтобы список не прыгал. */
  progressSlot: {
    height: 2,
    flexShrink: 0,
  },
  progress: {
    height: 2,
  },
  list: {
    flexGrow: 1,
    overflowY: 'auto',
    py: 0.5,
  },
  skeletonRow: {
    display: 'flex',
    gap: 1.5,
    px: 1.5,
    py: 1.25,
  },
  skeletonText: {
    flexGrow: 1,
  },
  error: {
    m: 1.5,
  },
  loadingMore: {
    display: 'flex',
    justifyContent: 'center',
    py: 1.5,
  },
  footer: {
    px: 2,
    py: 1,
    fontSize: 12,
    color: 'text.secondary',
    borderTop: '1px solid',
    borderColor: 'divider',
  },

  // Подсветку выбранной строки даёт тема MUI (primary с прозрачностью 8 %).
  item: {
    alignItems: 'flex-start',
    gap: 1.5,
    px: 1.5,
    py: 1.25,
  },
  itemBody: {
    minWidth: 0,
    flexGrow: 1,
  },
  itemTop: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 1,
  },
  peerName: {
    fontWeight: 600,
    fontSize: 14,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  time: {
    fontSize: 12,
    color: 'text.secondary',
    flexShrink: 0,
  },
  preview: {
    fontSize: 13,
    color: 'text.secondary',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    mt: 0.25,
  },
  itemBottom: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    mt: 0.75,
  },
} satisfies SxStyles;
