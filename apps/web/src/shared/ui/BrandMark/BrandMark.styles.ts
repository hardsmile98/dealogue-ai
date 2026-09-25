import type { SxStyles } from '@/shared/types';

export const brandMarkStyles = {
  root: {
    width: 44,
    height: 44,
    // Доля от размера: плашка остаётся «скруглённым квадратом» при любом размере.
    borderRadius: '30%',
    display: 'grid',
    placeItems: 'center',
    bgcolor: 'primary.main',
    color: 'primary.contrastText',
    flexShrink: 0,
  },
} satisfies SxStyles;
