import type { SxStyles } from '@/shared/types'

export const chatThreadStyles = {
  pane: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    bgcolor: '#f7f7fb',
  },
  notFound: {
    flexGrow: 1,
    display: 'grid',
    placeItems: 'center',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
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
    flexGrow: 1,
  },
  peerName: {
    fontWeight: 600,
    fontSize: 15,
  },
  peerMeta: {
    fontSize: 12,
    color: 'text.secondary',
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
  },
  skeletonRow: {
    display: 'flex',
    px: 2,
    py: 0.5,
  },
  dayDivider: {
    display: 'flex',
    justifyContent: 'center',
    my: 1.5,
  },
  dayDividerLabel: {
    px: 1.5,
    py: 0.25,
    borderRadius: 10,
    bgcolor: 'rgba(16, 24, 40, 0.06)',
    fontSize: 12,
    color: 'text.secondary',
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
} satisfies SxStyles
