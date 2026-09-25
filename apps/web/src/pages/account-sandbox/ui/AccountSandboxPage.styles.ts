import type { SxStyles } from '@/shared/types';

export const accountSandboxStyles = {
  // Как у «Чатов»: панель на всю оставшуюся высоту, лента и журнал
  // прокручиваются внутри, страница не растягивается на всю переписку.
  root: {
    flex: '1 1 0',
    display: 'grid',
    gridTemplateColumns: '260px minmax(0, 1fr)',
    gridTemplateRows: 'minmax(0, 1fr)',
    minHeight: { xs: 440, md: 560 },
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    overflow: 'hidden',
    bgcolor: 'background.paper',
  },
  singleColumn: {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  empty: {
    display: 'grid',
    placeItems: 'center',
    bgcolor: 'background.subtle',
    p: 3,
  },
} satisfies SxStyles;
