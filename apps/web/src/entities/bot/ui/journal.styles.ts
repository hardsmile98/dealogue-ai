import type { SxStyles } from '@/shared/types'

export const journalStyles = {
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'text.secondary',
    mb: 0.5,
  },
  small: {
    fontSize: 13,
    lineHeight: 1.5,
  },
  pre: {
    fontSize: 12.5,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    bgcolor: '#f7f7fb',
    borderRadius: 1.5,
    p: 1,
  },
  turnCard: {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2,
    p: 1.25,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  turnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    cursor: 'pointer',
    userSelect: 'none',
  },
  turnTitle: {
    fontSize: 13,
    fontWeight: 600,
    flexGrow: 1,
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 0.5,
  },
  factRow: {
    fontSize: 13,
    lineHeight: 1.5,
    display: 'flex',
    gap: 1,
  },
  factKind: {
    flexShrink: 0,
    color: 'text.secondary',
    minWidth: 96,
  },
} satisfies SxStyles
