import type { SxStyles } from '@/shared/types';
import { visuallyHidden } from '../visuallyHidden';

const delta = {
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
} as const;

export const statTileStyles = {
  root: {
    position: 'relative',
    p: 2.5,
    height: '100%',
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
    fontVariantNumeric: 'tabular-nums',
  },
  caption: {
    color: 'text.secondary',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    mt: 'auto',
  },
  deltaUp: { ...delta, color: 'success.dark' },
  deltaDown: { ...delta, color: 'error.dark' },
  deltaFlat: { color: 'text.secondary', fontWeight: 600 },
  deltaIcon: { fontSize: 14 },
  visuallyHidden,
} satisfies SxStyles;
