import type { SxStyles } from '@/shared/types';

/** Класс контейнера действий — по нему строка показывает их при наведении. */
export const BUBBLE_ACTIONS_CLASS = 'chat-bubble-actions';

export const chatBubbleStyles = {
  row: {
    display: 'flex',
    px: 2,
    py: 0.25,
  },
  rowIn: { justifyContent: 'flex-start' },
  rowOut: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: { xs: '86%', sm: 'min(72%, 560px)' },
    px: 1.75,
    py: 1,
    borderRadius: 1,
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  // «Хвостик» — меньшее скругление в углу со стороны отправителя.
  bubbleIn: {
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    borderBottomLeftRadius: '4px',
  },
  bubbleOut: {
    bgcolor: 'chat.outgoing',
    color: 'text.primary',
    borderBottomRightRadius: '4px',
  },
  bubbleMilestone: {
    bgcolor: 'chat.milestone',
    border: '1px dashed',
    borderColor: 'chat.milestoneBorder',
  },
  header: {
    mb: 0.5,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 0.75,
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 0.75,
    mt: 0.25,
    fontSize: 11,
    color: 'text.secondary',
  },
  actions: {
    display: 'inline-flex',
    opacity: 0,
    transition: 'opacity 120ms',
    // На тач-экранах наведения нет — действия видны всегда.
    '@media (hover: none)': { opacity: 1 },
  },
  rowWithActions: {
    [`&:hover .${BUBBLE_ACTIONS_CLASS}, & .${BUBBLE_ACTIONS_CLASS}:focus-within`]:
      { opacity: 1 },
  },
  readReceipt: {
    display: 'inline-flex',
    alignItems: 'center',
    color: 'text.disabled',
    '& svg': { fontSize: 14 },
  },
  readReceiptRead: {
    color: 'primary.main',
  },
} satisfies SxStyles;
