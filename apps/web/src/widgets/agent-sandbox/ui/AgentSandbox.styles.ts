import type { SxStyles } from '@/shared/types'

export const agentSandboxStyles = {
  toolbar: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 0.75,
    mb: 1.5,
  },
  spacer: {
    flexGrow: 1,
  },
  /** Лента диалога: прокручивается сама, чтобы панель управления не уезжала. */
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minHeight: 320,
    maxHeight: 520,
    overflowY: 'auto',
    p: 1,
    borderRadius: 2,
    bgcolor: 'action.hover',
  },
  bubbleRow: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '85%',
  },
  bubbleRowClient: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleRowBot: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubble: {
    px: 1.75,
    py: 1,
    borderRadius: 3,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: 14,
  },
  bubbleClient: {
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
  },
  bubbleBot: {
    bgcolor: '#e0e7ff',
  },
  bubbleMeta: {
    mt: 0.25,
    fontSize: 11,
    color: 'text.secondary',
  },
  blockBadge: {
    mb: 0.5,
    height: 18,
    fontSize: 10,
  },
  /** Служебные строки посреди ленты: время, этапы, касания. */
  systemLine: {
    alignSelf: 'center',
    maxWidth: '92%',
    textAlign: 'center',
    fontSize: 12,
    color: 'text.secondary',
    px: 1,
  },
  systemStrong: {
    alignSelf: 'center',
    maxWidth: '92%',
  },
  alert: {
    alignSelf: 'stretch',
  },
  details: {
    mt: 0.5,
    p: 1.25,
    borderRadius: 2,
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    fontSize: 12.5,
    textAlign: 'left',
  },
  detailsLine: {
    mt: 0.5,
  },
  detailsMuted: {
    mt: 0.5,
    color: 'text.secondary',
  },
  detailsToggle: {
    fontSize: 11,
    minHeight: 0,
    py: 0.25,
  },
  prompt: {
    mt: 1,
    p: 1,
    borderRadius: 1,
    bgcolor: 'action.hover',
    fontSize: 11,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 360,
    overflowY: 'auto',
  },
  composer: {
    mt: 1.5,
  },
  composerRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 1,
  },
  actionsRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 1,
    mt: 1,
  },
  waitSelect: {
    width: 190,
  },
  turnSelect: {
    width: 230,
  },
  stateLine: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 1,
    fontSize: 13,
    py: 0.25,
  },
  stateLabel: {
    color: 'text.secondary',
    flexShrink: 0,
  },
  stateValue: {
    textAlign: 'right',
    wordBreak: 'break-word',
  },
  stateGroup: {
    mt: 1.5,
    mb: 0.5,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: 'text.secondary',
  },
  startHint: {
    mb: 1.5,
  },
} satisfies SxStyles
