import { alpha } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import type { SxStyles } from '@/shared/types';

export const chatThreadStyles = {
  pane: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    bgcolor: 'background.subtle',
  },
  notFound: {
    flexGrow: 1,
    display: 'grid',
    placeItems: 'center',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: { xs: 'wrap', sm: 'nowrap' },
    gap: 1.5,
    px: 2,
    py: 1.5,
    bgcolor: 'background.paper',
    borderBottom: '1px solid',
    borderColor: 'divider',
  },
  backButton: {
    mr: -0.5,
  },
  headerText: {
    minWidth: 0,
    flex: '1 1 160px',
  },
  peerName: {
    fontWeight: 600,
    fontSize: 15,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  peerMeta: {
    fontSize: 12,
    color: 'text.secondary',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerChips: {
    display: { xs: 'none', sm: 'flex' },
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 0.75,
    mt: 0.5,
    fontSize: 12,
    color: 'text.secondary',
  },
  headerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 1,
    // На телефоне кнопки уходят второй строкой на всю ширину шапки.
    width: { xs: '100%', sm: 'auto' },
    flexShrink: 0,
  },

  feed: {
    flexGrow: 1,
    overflowY: 'auto',
    py: 1.5,
    // Положение при подгрузке держит useFeedScroll; встроенная подстройка
    // браузера поверх неё сдвигала бы ленту дважды.
    overflowAnchor: 'none',
  },
  loadingOlder: {
    display: 'flex',
    justifyContent: 'center',
    py: 1,
  },
  feedError: {
    mx: 2,
    mb: 1,
  },
  skeletonRow: {
    display: 'flex',
    px: 2,
    py: 0.5,
  },
  skeletonIn: { justifyContent: 'flex-start' },
  skeletonOut: { justifyContent: 'flex-end' },
  dayDivider: {
    display: 'flex',
    justifyContent: 'center',
    my: 1.5,
  },
  dayDividerLabel: {
    m: 0,
    px: 1.5,
    py: 0.25,
    borderRadius: '999px',
    bgcolor: (theme: Theme) => alpha(theme.palette.text.primary, 0.06),
    fontSize: 12,
    fontWeight: 400,
    color: 'text.secondary',
  },
  messageAction: {
    p: 0.25,
    color: 'inherit',
    '& svg': { fontSize: 14 },
  },

  composer: {
    px: 2,
    pt: 1.25,
    pb: 1,
    bgcolor: 'background.paper',
    borderTop: '1px solid',
    borderColor: 'divider',
  },
  composerError: {
    mb: 1,
  },
  composerRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 1,
  },
  composerHint: {
    mt: 0.5,
    fontSize: 11,
    color: 'text.secondary',
  },
  composerWarning: {
    color: 'warning.dark',
  },
} satisfies SxStyles;
