import type { SxStyles } from '@/shared/types'

export const attentionListStyles = {
  card: {
    p: 2,
  },
  /** Закрытый алерт остаётся в списке, но не тянет на себя внимание. */
  resolvedCard: {
    p: 2,
    opacity: 0.6,
  },
  row: {
    alignItems: { sm: 'center' },
  },
  body: {
    flexGrow: 1,
    minWidth: 0,
  },
  chips: {
    alignItems: 'center',
    flexWrap: 'wrap',
    mb: 0.5,
  },
  meta: {
    fontSize: 12,
    color: 'text.secondary',
  },
  metaLine: {
    fontSize: 12,
    mt: 0.5,
    color: 'text.secondary',
  },
  who: {
    fontWeight: 600,
  },
  quote: {
    fontSize: 13,
    mt: 0.75,
    fontStyle: 'italic',
    color: 'text.secondary',
  },
  error: {
    fontSize: 13,
    mt: 0.75,
    color: 'error.main',
  },
  actions: {
    alignItems: { xs: 'stretch', sm: 'flex-end' },
    flexShrink: 0,
  },
} satisfies SxStyles
