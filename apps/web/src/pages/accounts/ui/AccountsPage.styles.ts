import type { SxStyles } from '@/shared/types';

/** Колонка, которую на телефоне прячем: ширины не хватает. */
const WIDE_ONLY = { display: { xs: 'none', sm: 'table-cell' } } as const;

export const accountsPageStyles = {
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1,
    mb: 2,
  },
  tableCard: {
    overflow: 'hidden',
  },
  // position: relative — чтобы скрытые подписи (position: absolute) внутри
  // таблицы обрезались этим контейнером, а не растягивали страницу вбок.
  tableScroll: {
    position: 'relative',
    overflowX: 'auto',
  },
  table: {
    '& .MuiTableCell-head': { bgcolor: 'background.default' },
    '& .MuiTableCell-root': { px: 1.5 },
    '& .MuiTableCell-root:first-of-type': { pl: { xs: 2, sm: 2.5 } },
    '& .MuiTableCell-root:last-of-type': { pr: 2 },
    '& .MuiTableRow-root:last-child .MuiTableCell-root': {
      borderBottom: 'none',
    },
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
  accountText: {
    minWidth: 0,
    flexGrow: 1,
  },
  accountName: {
    fontWeight: 600,
    fontSize: 14,
    color: 'text.primary',
    textDecoration: 'none',
    '&:hover': { color: 'primary.main' },
    '&:focus-visible': {
      outline: '2px solid',
      outlineColor: 'primary.main',
      outlineOffset: '2px',
      borderRadius: '2px',
    },
  },
  accountMeta: {
    fontSize: 12,
    color: 'text.secondary',
  },
  statusCell: {
    minWidth: 150,
    maxWidth: 220,
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
  numberHead: {
    width: 88,
  },
  number: {
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
  },
  syncCell: {
    ...WIDE_ONLY,
    whiteSpace: 'nowrap',
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
  skeletonText: {
    flexGrow: 1,
  },
  skeletonRight: {
    ml: 'auto',
  },
} satisfies SxStyles;
