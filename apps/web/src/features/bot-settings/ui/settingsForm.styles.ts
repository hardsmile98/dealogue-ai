import type { SxStyles } from '@/shared/types';

export const settingsFormStyles = {
  genderSelect: {
    minWidth: { sm: 180 },
  },
  fieldset: {
    border: 0,
    p: 0,
    m: 0,
    minWidth: 0,
  },
  linkRow: {
    alignItems: 'flex-start',
  },
  linkFields: {
    flexGrow: 1,
    minWidth: 0,
  },
  linkTitle: {
    width: { xs: '100%', sm: 220 },
    flexShrink: 0,
  },
  addLink: {
    alignSelf: 'flex-start',
  },
  formActions: {
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  kindCounts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1,
  },
  importActions: {
    flexWrap: 'wrap',
  },
  rangeLabel: {
    mb: 1,
  },
  rangeFields: {
    alignItems: 'flex-start',
  },
} satisfies SxStyles;
