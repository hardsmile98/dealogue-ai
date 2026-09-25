import type { SxStyles } from '@/shared/types';

export const chatPanelStyles = {
  // Панель занимает всю оставшуюся высоту страницы (flex-цепочка от AppShell),
  // а список и лента прокручиваются внутри — страница не растягивается.
  root: {
    flex: '1 1 0',
    display: 'grid',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '360px minmax(0, 1fr)' },
    gridTemplateRows: 'minmax(0, 1fr)',
    minHeight: { xs: 440, md: 520 },
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    overflow: 'hidden',
    bgcolor: 'background.paper',
  },
  singleColumn: {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  emptyThread: {
    display: 'grid',
    placeItems: 'center',
    minHeight: 0,
    bgcolor: 'background.subtle',
  },
} satisfies SxStyles;
