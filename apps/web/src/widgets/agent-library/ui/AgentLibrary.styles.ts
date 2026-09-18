import type { SxStyles } from '@/shared/types'

/** Общие стили разделов библиотеки: у всех одинаковые шапка, таблица и строки. */
export const agentLibraryStyles = {
  header: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 1,
  },
  hint: {
    flexGrow: 1,
    minWidth: 240,
  },
  /** Выключенная запись остаётся видимой, но приглушена. */
  disabledRow: {
    opacity: 0.55,
  },
  nowrapCell: {
    whiteSpace: 'nowrap',
  },
  rowTitle: {
    fontWeight: 600,
    fontSize: 13,
  },
  textCell: {
    fontSize: 13,
    whiteSpace: 'pre-line',
  },
  filterChips: {
    flexWrap: 'wrap',
    gap: 0.75,
    alignItems: 'center',
  },
  filterRow: {
    alignItems: 'center',
  },
  spacer: {
    flexGrow: 1,
  },
  narrowSelect: {
    width: 200,
  },
  tinySelect: {
    width: 120,
  },
  dialogSelect: {
    width: 220,
  },
  grow: {
    flexGrow: 1,
    minWidth: 0,
  },
  itemRow: {
    alignItems: 'center',
  },
  categoryCell: {
    fontSize: 13,
    maxWidth: 420,
  },
  clarifyCell: {
    fontSize: 12,
    maxWidth: 260,
  },
  phraseCell: {
    maxWidth: 520,
  },
  /** Три строки текста с многоточием — карточка не должна разъезжаться. */
  phraseText: {
    fontSize: 13,
    color: 'text.secondary',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    whiteSpace: 'pre-line',
  },
  audienceCell: {
    whiteSpace: 'nowrap',
    fontSize: 12,
  },
  replyCell: {
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  replyBadge: {
    mt: 0.5,
  },
  selectableRow: {
    cursor: 'pointer',
  },
  emptyCellChip: {
    opacity: 0.4,
  },
  noteRow: {
    alignItems: 'center',
    p: 1.25,
    borderRadius: 2,
    border: '1px solid',
    borderColor: 'divider',
  },
  noteMeta: {
    alignItems: 'center',
    mt: 0.5,
  },
  subheading: {
    fontWeight: 700,
    mb: 1,
  },
  playbookHeader: {
    alignItems: 'center',
    mb: 1.5,
  },
  splitPreview: {
    mt: 1,
  },
  splitHeader: {
    alignItems: 'center',
    mb: 1,
  },
  splitList: {
    maxHeight: 260,
    overflowY: 'auto',
  },
  /** Пузырь сообщения в предпросмотре — как в переписке Telegram. */
  splitMessage: {
    p: 1,
    borderRadius: 2,
    bgcolor: '#e0e7ff',
    fontSize: 12,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  splitMessageMeta: {
    display: 'block',
    color: 'text.secondary',
    mb: 0.25,
  },
  toolbar: {
    mb: 2.5,
  },
  toolbarRow: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 1,
  },
  toolbarActions: {
    ml: 'auto',
  },
  copyOptions: {
    flexWrap: 'wrap',
  },
} satisfies SxStyles
