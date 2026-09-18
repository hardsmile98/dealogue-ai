import type { SxStyles } from '@/shared/types'

export const chatAgentStyles = {
  root: {
    px: 2,
    py: 1,
    bgcolor: 'background.paper',
    borderBottom: '1px solid',
    borderColor: 'divider',
  },
  headerRow: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 0.75,
  },
  modeChip: {
    fontWeight: 600,
  },
  spacer: {
    flexGrow: 1,
  },
  slotsRow: {
    alignItems: 'center',
    mt: 0.75,
    flexWrap: 'wrap',
    gap: 0.5,
  },
  slotsButton: {
    p: 0.25,
  },
  slotsIcon: {
    fontSize: 14,
  },
  panelError: {
    mt: 1,
  },
  journal: {
    borderTop: '1px solid',
    borderColor: 'divider',
    '&:before': { display: 'none' },
  },
  journalTitle: {
    fontWeight: 600,
  },
  journalBody: {
    maxHeight: 360,
    overflowY: 'auto',
    pt: 0,
  },
  turnCard: {
    p: 1.25,
    borderRadius: 2,
    border: '1px solid',
    borderColor: 'divider',
    fontSize: 13,
  },
  turnHeader: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 0.5,
  },
  turnBadge: {
    height: 20,
    fontSize: 11,
  },
  turnLine: {
    mt: 0.5,
  },
  turnMessages: {
    mt: 0.25,
  },
  /** Черновик сообщения в журнале — нейтральная плашка, не пузырь чата. */
  turnMessage: {
    px: 1,
    py: 0.5,
    borderRadius: 1.5,
    bgcolor: 'action.hover',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  turnMessageBadge: {
    mr: 0.5,
    height: 18,
    fontSize: 10,
  },
  turnGuard: {
    display: 'block',
    mt: 0.5,
  },
  rateButton: {
    p: 0.25,
  },
  rateIcon: {
    fontSize: 16,
  },
} satisfies SxStyles
