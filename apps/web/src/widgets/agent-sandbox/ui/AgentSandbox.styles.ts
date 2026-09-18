import type { SxStyles } from '@/shared/types'

export const agentSandboxStyles = {
  historyRow: {
    alignItems: 'flex-start',
  },
  roleSelect: {
    width: 130,
  },
  placeholder: {
    color: 'text.secondary',
    p: 2,
  },
  verdictRow: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 0.5,
  },
  spacer: {
    flexGrow: 1,
  },
  /** Ответ бота — таким же пузырём, как в переписке. */
  bubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    px: 1.75,
    py: 1,
    borderRadius: 3,
    bgcolor: '#e0e7ff',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: 14,
  },
  bubbleBadge: {
    mb: 0.5,
    height: 18,
    fontSize: 10,
  },
  analysis: {
    fontSize: 13,
  },
  analysisLine: {
    mt: 0.75,
  },
  analysisMuted: {
    mt: 0.75,
    color: 'text.secondary',
  },
  prompt: {
    mt: 1,
    p: 1.5,
    borderRadius: 2,
    bgcolor: 'action.hover',
    fontSize: 11,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 480,
    overflowY: 'auto',
  },
} satisfies SxStyles
