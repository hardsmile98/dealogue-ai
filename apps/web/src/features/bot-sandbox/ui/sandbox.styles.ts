import type { SxStyles } from '@/shared/types'

export const sandboxStyles = {
  // Список сессий.
  list: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    // По брейкпоинту меняется только ширина: шорткат '1px solid' внутри
    // media-запроса сбрасывал цвет на currentColor, и полоса выходила чёрной.
    borderRightStyle: 'solid',
    borderRightWidth: { xs: 0, md: 1 },
    borderColor: 'divider',
  },
  listHeader: {
    p: 1.5,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  listItems: {
    overflowY: 'auto',
    flexGrow: 1,
  },
  listItemText: {
    minWidth: 0,
    flexGrow: 1,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  listItemMeta: {
    fontSize: 12,
    color: 'text.secondary',
  },

  // Диалог.
  session: {
    display: 'flex',
    minHeight: 0,
    minWidth: 0,
  },
  dialog: {
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    bgcolor: '#f7f7fb',
  },
  dialogHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    px: 2,
    py: 1.25,
    bgcolor: 'background.paper',
    borderBottom: '1px solid',
    borderColor: 'divider',
  },
  backButton: {
    ml: -0.75,
  },
  dialogHeaderText: {
    minWidth: 0,
    flexGrow: 1,
  },
  dialogTitle: {
    fontWeight: 600,
    fontSize: 15,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 0.75,
    mt: 0.5,
    fontSize: 12,
    color: 'text.secondary',
  },
  clock: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    '& svg': { fontSize: 16 },
  },
  chat: {
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  hidden: {
    display: 'none',
  },
  feed: {
    flexGrow: 1,
    overflowY: 'auto',
    py: 1.5,
  },
  feedEmpty: {
    px: 3,
    py: 6,
    textAlign: 'center',
    color: 'text.secondary',
    fontSize: 14,
  },
  row: {
    display: 'flex',
    px: 2,
    py: 0.25,
  },
  rowIn: { justifyContent: 'flex-start' },
  rowOut: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: 'min(78%, 560px)',
    px: 1.75,
    py: 1,
    borderRadius: 3,
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  bubbleIn: {
    bgcolor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    borderBottomLeftRadius: 6,
  },
  bubbleOut: {
    bgcolor: '#e0e7ff',
    borderBottomRightRadius: 6,
  },
  bubbleBlock: {
    bgcolor: '#ede9fe',
    border: '1px dashed',
    borderColor: '#a78bfa',
  },
  blockBadge: {
    mb: 0.5,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#6d28d9',
  },
  collapsed: {
    maxHeight: 132,
    overflow: 'hidden',
    maskImage: 'linear-gradient(to bottom, black 70%, transparent)',
  },
  expand: {
    mt: 0.25,
    p: 0,
    minWidth: 0,
    fontSize: 12,
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
    '& svg': { fontSize: 14 },
  },
  readMark: { color: 'primary.main' },
  unreadMark: { color: 'text.disabled' },

  // Ввод и управление.
  composer: {
    px: 2,
    pt: 1.25,
    pb: 1.25,
    bgcolor: 'background.paper',
    borderTop: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  composerRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 1,
  },
  // На телефоне кнопки — одна строка с прокруткой вбок, а не три строки над лентой.
  controls: {
    display: 'flex',
    flexWrap: { xs: 'nowrap', sm: 'wrap' },
    overflowX: { xs: 'auto', sm: 'visible' },
    scrollbarWidth: 'none',
    alignItems: 'center',
    gap: 1,
    '& > *': { flexShrink: 0 },
    '& .MuiButton-root': { whiteSpace: 'nowrap' },
  },
  hint: {
    fontSize: 11,
    color: 'text.secondary',
  },
  composerHint: {
    display: { xs: 'none', sm: 'block' },
  },

  // Инспектор.
  inspector: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    bgcolor: 'background.paper',
  },
  inspectorSide: {
    width: { lg: 360, xl: 400 },
    flexShrink: 0,
    borderLeft: '1px solid',
    borderColor: 'divider',
  },
  inspectorStacked: {
    flex: '1 1 0',
  },
  inspectorBar: {
    display: 'flex',
    alignItems: 'center',
    pr: 0.5,
    borderBottom: '1px solid',
    borderColor: 'divider',
  },
  inspectorTabs: {
    flexGrow: 1,
    minWidth: 0,
  },
  // Свёрнутая панель: столбик иконок справа или строка в шапке диалога.
  rail: {
    width: 52,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0.5,
    py: 1,
    bgcolor: 'background.paper',
    borderLeft: '1px solid',
    borderColor: 'divider',
  },
  railInline: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    mr: -0.75,
  },
  railBadge: {
    '& .MuiBadge-badge': { fontSize: 10, height: 16, minWidth: 16, px: 0.5 },
  },
  inspectorBody: {
    overflowY: 'auto',
    flexGrow: 1,
    p: 1.5,
    display: 'flex',
    flexDirection: 'column',
    gap: 1.5,
  },
  small: {
    fontSize: 13,
    lineHeight: 1.5,
  },
} satisfies SxStyles
