import type { SxStyles } from '@/shared/types'

export const stackedColumnChartStyles = {
  root: {
    position: 'relative',
    width: '100%',
  },
  svg: {
    display: 'block',
    width: '100%',
    overflow: 'visible',
    '& .hit:focus-visible': {
      outline: 'none',
    },
  },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    color: 'text.secondary',
    fontSize: 14,
  },
  tooltip: {
    position: 'absolute',
    top: 8,
    zIndex: 2,
    pointerEvents: 'none',
    minWidth: 180,
    p: 1.5,
    borderRadius: 2,
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    boxShadow: '0 8px 24px rgba(16, 24, 40, 0.12)',
  },
  tooltipTitle: {
    fontSize: 12,
    color: 'text.secondary',
    mb: 0.75,
  },
  tooltipTotal: {
    fontSize: 14,
    fontWeight: 600,
    mb: 0.75,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 2,
  },
  tooltipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    fontSize: 13,
    lineHeight: 1.7,
  },
  tooltipKey: {
    width: 12,
    height: 3,
    borderRadius: 2,
    flexShrink: 0,
  },
  tooltipLabel: {
    color: 'text.secondary',
    flexGrow: 1,
    whiteSpace: 'nowrap',
  },
  tooltipValue: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 16px',
    mb: 2,
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.75,
    fontSize: 13,
    color: 'text.secondary',
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: '3px',
  },
} satisfies SxStyles
