import type { SxStyles } from '@/shared/types'

export const messageBubbleStyles = {
  row: {
    display: 'flex',
    px: 2,
    py: 0.25,
  },
  rowIn: { justifyContent: 'flex-start' },
  rowOut: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: 'min(72%, 560px)',
    px: 1.75,
    py: 1,
    borderRadius: 3,
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    position: 'relative',
  },
  bubbleIn: {
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    borderBottomLeftRadius: 6,
  },
  bubbleOut: {
    bgcolor: '#e0e7ff',
    color: 'text.primary',
    borderBottomRightRadius: 6,
  },
  meta: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 0.5,
    mt: 0.25,
    fontSize: 11,
    color: 'text.secondary',
  },
  firstBadge: {
    mb: 0.75,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 0.75,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'primary.main',
  },
} satisfies SxStyles
