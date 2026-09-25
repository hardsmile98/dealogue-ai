import type { SxStyles } from '@/shared/types';

export const journalStyles = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0.5,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'text.secondary',
  },
  small: {
    fontSize: 13,
    lineHeight: 1.5,
  },
  muted: {
    fontSize: 13,
    lineHeight: 1.5,
    color: 'text.secondary',
  },
  pre: {
    fontSize: 12.5,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    bgcolor: 'background.subtle',
    borderRadius: '8px',
    p: 1,
  },
  list: {
    fontSize: 13,
    lineHeight: 1.5,
    pl: 2.5,
    my: 0.25,
  },
  skippedPoint: {
    color: 'text.disabled',
  },

  turnCard: {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    overflow: 'hidden',
  },
  turnHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 1,
    px: 1.25,
    py: 1,
    textAlign: 'left',
    '&:hover': { bgcolor: 'action.hover' },
    '&.Mui-focusVisible': { bgcolor: 'action.focus' },
  },
  turnTitle: {
    fontSize: 13,
    fontWeight: 600,
    flexGrow: 1,
  },
  turnTime: {
    fontWeight: 400,
    color: 'text.secondary',
    ml: 1,
  },
  turnError: {
    px: 1.25,
    pb: 1,
    fontSize: 13,
    lineHeight: 1.5,
  },
  turnBody: {
    px: 1.25,
    pb: 1.25,
    display: 'flex',
    flexDirection: 'column',
    gap: 1.25,
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
  factNote: {
    display: 'block',
    fontSize: 12,
    color: 'text.secondary',
  },
  inactiveJob: {
    color: 'text.disabled',
  },
} satisfies SxStyles;
