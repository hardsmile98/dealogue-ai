import type { SxStyles } from '@/shared/types';

export const sandboxSessionListStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    // По брейкпоинту меняется только ширина: шорткат '1px solid' внутри
    // media-запроса сбрасывал цвет на currentColor, и полоса выходила чёрной.
    borderRightStyle: 'solid',
    borderRightWidth: { xs: 0, md: 1 },
    borderColor: 'divider',
  },
  header: {
    p: 1.5,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    borderBottom: '1px solid',
    borderColor: 'divider',
  },
  hint: {
    fontSize: 12,
    color: 'text.secondary',
  },
  items: {
    overflowY: 'auto',
    flexGrow: 1,
    py: 0.5,
  },
  skeleton: {
    mx: 1.5,
    my: 1,
  },
  itemText: {
    minWidth: 0,
    flexGrow: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemMeta: {
    fontSize: 12,
    color: 'text.secondary',
  },
} satisfies SxStyles;
