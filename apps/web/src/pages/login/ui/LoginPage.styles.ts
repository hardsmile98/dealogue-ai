import type { SxStyles } from '@/shared/types'

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
    background: 'linear-gradient(155deg, #4338ca 0%, #5b21b6 55%, #4f46e5 100%)',
  },
  brandHeader: {
    alignItems: 'center',
  },
  brandMark: {
    bgcolor: 'rgba(255, 255, 255, 0.16)',
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
    color: 'rgba(255, 255, 255, 0.78)',
  },
  highlightIcon: {
    mt: '2px',
    opacity: 0.9,
  },
  highlightTitle: {
    fontWeight: 600,
  },
  highlightText: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  brandFooter: {
    color: 'rgba(255, 255, 255, 0.6)',
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
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 3,
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
} satisfies SxStyles
