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
  /** Варианты «докуда ведёт агент» — карточками: в ряд на широком экране, стопкой на узком. */
  handoffOptions: {
    display: 'grid',
    gridTemplateColumns: {
      xs: 'minmax(0, 1fr)',
      md: 'repeat(3, minmax(0, 1fr))',
    },
    gap: 1.5,
  },
  handoffOption: {
    m: 0,
    alignItems: 'flex-start',
    gap: 0.5,
    p: 1.5,
    pl: 1,
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2,
    transition: 'border-color 120ms, background-color 120ms',
    '& .MuiRadio-root': {
      mt: -0.5,
    },
  },
  handoffOptionSelected: {
    borderColor: 'primary.main',
    bgcolor: 'action.selected',
  },
  handoffTitle: {
    fontWeight: 600,
    mb: 0.25,
  },
} satisfies SxStyles;
