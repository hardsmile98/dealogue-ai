import type { SxStyles } from '@/shared/types'

export const accountStatsStyles = {
  filters: {
    mb: 3,
  },
  /** Пока грузится новый период — держим старый рендер, слегка приглушив. */
  refetching: {
    opacity: 0.55,
    transition: 'opacity 150ms',
    pointerEvents: 'none',
  },
  card: {
    p: { xs: 2, sm: 3 },
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 3,
    height: '100%',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
  },
  cardSubtitle: {
    color: 'text.secondary',
    fontSize: 13,
    mb: 2,
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
  table: {
    '& .MuiTableCell-head': {
      fontSize: 12,
      fontWeight: 600,
      color: 'text.secondary',
      whiteSpace: 'nowrap',
      bgcolor: 'background.paper',
    },
    '& .MuiTableCell-root': { borderColor: 'divider', px: 1.25 },
  },
  tableScroll: {
    maxHeight: 420,
    overflow: 'auto',
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
  shareCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
  },
  shareTrack: {
    flexGrow: 1,
    height: 6,
    borderRadius: 3,
    bgcolor: 'action.hover',
    overflow: 'hidden',
  },
  shareFill: {
    height: '100%',
    borderRadius: 3,
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
} satisfies SxStyles
