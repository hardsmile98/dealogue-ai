import type { SxProps, Theme } from '@mui/material/styles';

/**
 * Текст только для экранного диктора: в вёрстке его не видно, но он
 * читается. Для подписей к иконкам и живых регионов.
 */
export const visuallyHidden: SxProps<Theme> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};
