import type { SxStyles } from '@/shared/types'

export const accountsPageStyles = {
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1,
    mb: 2,
  },
  tableCard: {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 3,
    overflow: 'hidden',
  },
  table: {
    '& .MuiTableCell-head': {
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.3,
      color: 'text.secondary',
      bgcolor: 'background.default',
    },
    '& .MuiTableCell-root': { borderColor: 'divider', px: 1.5 },
    '& .MuiTableCell-root:first-of-type': { pl: 2.5 },
    '& .MuiTableCell-root:last-of-type': { pr: 2 },
    '& .MuiTableRow-root:last-child .MuiTableCell-root': { borderBottom: 'none' },
  },
  row: {
    cursor: 'pointer',
  },
  accountCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    minWidth: 180,
  },
  accountName: {
    fontWeight: 600,
    fontSize: 14,
    whiteSpace: 'nowrap',
  },
  accountMeta: {
    fontSize: 12,
    color: 'text.secondary',
  },
  statusCell: {
    minWidth: 150,
    maxWidth: 200,
  },
  numberHead: {
    width: 88,
  },
  syncCell: {
    whiteSpace: 'nowrap',
  },
  statusMessage: {
    display: 'block',
    mt: 0.5,
    fontSize: 12,
    color: 'text.secondary',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  number: {
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
  },
  muted: {
    color: 'text.disabled',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 0.5,
    whiteSpace: 'nowrap',
  },
  mockNote: {
    mt: 2,
    color: 'text.secondary',
    fontSize: 12,
  },
} satisfies SxStyles
