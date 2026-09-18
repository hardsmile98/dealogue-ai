import type { SxStyles } from '@/shared/types'

export const draftQueueStyles = {
  root: {
    mb: 3,
  },
  card: {
    p: 2,
  },
  body: {
    flexGrow: 1,
    minWidth: 0,
  },
  chips: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 0.5,
    mb: 0.5,
  },
  meta: {
    fontSize: 12,
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
  /** Предложенный ботом ответ — нейтральной плашкой, чтобы не путать с цитатой клиента. */
  suggestion: {
    mt: 0.75,
    px: 1,
    py: 0.75,
    borderRadius: 1.5,
    bgcolor: 'action.hover',
    whiteSpace: 'pre-wrap',
    fontSize: 13,
  },
  rationale: {
    fontSize: 13,
    mt: 0.75,
    color: 'text.secondary',
  },
  error: {
    mt: 1,
  },
  actions: {
    alignItems: { xs: 'stretch', sm: 'flex-end' },
    flexShrink: 0,
  },
} satisfies SxStyles
