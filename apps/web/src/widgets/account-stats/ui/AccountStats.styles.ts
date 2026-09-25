import type { SxStyles } from '@/shared/types';

export const accountStatsStyles = {
  /** Пока грузится новый период — держим старый рендер, слегка приглушив. */
  refetching: {
    opacity: 0.55,
    transition: 'opacity 150ms',
    pointerEvents: 'none',
  },
  rule: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 1,
    mt: 2,
    pt: 2,
    borderTop: '1px solid',
    borderColor: 'divider',
    color: 'text.secondary',
    fontSize: 13,
    '& svg': { fontSize: 18, mt: '1px', flexShrink: 0 },
  },
  // Заголовки ячеек оформляет тема (MuiTableCell.head); здесь — только фон
  // для «липкой» шапки и плотность.
  table: {
    '& .MuiTableCell-head': { bgcolor: 'background.paper' },
    '& .MuiTableCell-root': { px: 1.25 },
  },
  tableScroll: {
    maxHeight: 420,
    overflow: 'auto',
  },
  shareHead: {
    width: '45%',
  },
  empty: {
    py: 2,
    color: 'text.secondary',
  },
  headerWithSwatch: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.75,
  },
  codeCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: '3px',
    flexShrink: 0,
  },
  numberCell: {
    fontVariantNumeric: 'tabular-nums',
  },
  dayCell: {
    whiteSpace: 'nowrap',
  },
  totalCell: {
    fontWeight: 600,
  },
  shareCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
  },
  shareTrack: {
    flexGrow: 1,
    height: 6,
    borderRadius: '999px',
    bgcolor: 'action.hover',
    overflow: 'hidden',
  },
  shareFill: {
    height: '100%',
    borderRadius: '999px',
  },
  shareValue: {
    width: 44,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    color: 'text.secondary',
    fontSize: 13,
  },
  emptyRow: {
    '& .MuiTableCell-root': { color: 'text.disabled' },
  },
  totalRow: {
    '& .MuiTableCell-root': {
      fontWeight: 600,
      borderBottom: 'none',
      bgcolor: 'background.default',
    },
  },
} satisfies SxStyles;
