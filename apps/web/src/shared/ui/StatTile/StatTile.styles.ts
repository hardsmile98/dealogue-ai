import type { SxStyles } from '@/shared/types'

export const statTileStyles = {
  root: {
    p: 2.5,
    height: '100%',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 3,
    display: 'flex',
    flexDirection: 'column',
    gap: 0.5,
  },
  label: {
    color: 'text.secondary',
    fontSize: 13,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: 1,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: '3px',
    flexShrink: 0,
  },
  value: {
    fontSize: 32,
    lineHeight: 1.15,
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: 'text.primary',
  },
  caption: {
    color: 'text.secondary',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    mt: 'auto',
  },
  deltaUp: { color: '#006300', fontWeight: 600, display: 'inline-flex', alignItems: 'center' },
  deltaDown: { color: '#b42318', fontWeight: 600, display: 'inline-flex', alignItems: 'center' },
  deltaFlat: { color: 'text.secondary', fontWeight: 600 },
} satisfies SxStyles
