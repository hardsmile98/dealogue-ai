import { alpha } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import type { SxStyles } from '@/shared/types';

/** Белый с прозрачностью — второстепенный текст на брендовом градиенте. */
const onBrand = (opacity: number) => (theme: Theme) =>
  alpha(theme.palette.common.white, opacity);

export const loginPageStyles = {
  root: {
    minHeight: '100dvh',
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' },
  },

  // Брендовая колонка — только на широких экранах.
  brandPanel: {
    display: { xs: 'none', md: 'flex' },
    flexDirection: 'column',
    justifyContent: 'space-between',
    p: 6,
    color: 'common.white',
    background: (theme: Theme) =>
      `linear-gradient(155deg, ${theme.palette.primary.dark} 0%, ${theme.palette.secondary.dark} 55%, ${theme.palette.primary.main} 100%)`,
  },
  brandHeader: {
    alignItems: 'center',
  },
  brandMark: {
    bgcolor: onBrand(0.16),
    color: 'common.white',
  },
  brandName: {
    fontWeight: 700,
  },
  brandBody: {
    maxWidth: 460,
  },
  brandTitle: {
    mb: 2,
  },
  brandSubtitle: {
    mb: 5,
    color: onBrand(0.78),
  },
  highlights: {
    listStyle: 'none',
    m: 0,
    p: 0,
  },
  highlightIcon: {
    mt: '2px',
    opacity: 0.9,
  },
  highlightTitle: {
    fontWeight: 600,
  },
  highlightText: {
    color: onBrand(0.72),
  },
  brandFooter: {
    color: onBrand(0.6),
  },

  // Колонка с формой.
  formPanel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    p: { xs: 2, sm: 4 },
    bgcolor: 'background.default',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    p: { xs: 3, sm: 4 },
  },
  cardHeader: {
    alignItems: 'center',
    mb: 3,
  },
  cardBrandMark: {
    display: { xs: 'grid', md: 'none' },
    mb: 1,
  },
  cardSubtitle: {
    textAlign: 'center',
  },
  expired: {
    mb: 2,
  },
} satisfies SxStyles;
