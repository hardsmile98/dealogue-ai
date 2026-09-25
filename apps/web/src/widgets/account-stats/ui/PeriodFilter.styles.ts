import type { SxStyles } from '@/shared/types';

export const periodFilterStyles = {
  root: {
    alignItems: { xs: 'stretch', sm: 'center' },
    flexWrap: 'wrap',
  },
  // На телефоне пять кнопок не помещаются — группа прокручивается вбок.
  // minWidth: 0 — иначе flex-элемент растягивается по содержимому за экран.
  presets: {
    minWidth: 0,
    maxWidth: '100%',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  dates: {
    alignItems: 'center',
    minWidth: 0,
  },
  date: {
    flex: { xs: '1 1 0', sm: 'none' },
    minWidth: 0,
  },
} satisfies SxStyles;
