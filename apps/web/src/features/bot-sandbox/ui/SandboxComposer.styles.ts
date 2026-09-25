import type { SxStyles } from '@/shared/types';

export const sandboxComposerStyles = {
  root: {
    px: 2,
    py: 1.25,
    bgcolor: 'background.paper',
    borderTop: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 1,
  },
  addButton: {
    minWidth: 0,
    px: 1.25,
    alignSelf: 'stretch',
    maxHeight: 40,
  },
  // На телефоне кнопки — одна строка с прокруткой вбок, а не три строки над лентой.
  controls: {
    display: 'flex',
    flexWrap: { xs: 'nowrap', sm: 'wrap' },
    overflowX: { xs: 'auto', sm: 'visible' },
    scrollbarWidth: 'none',
    alignItems: 'center',
    gap: 1,
    '& > *': { flexShrink: 0 },
    '& .MuiButton-root': { whiteSpace: 'nowrap' },
  },
  hint: {
    fontSize: 11,
    color: 'text.secondary',
    display: { xs: 'none', sm: 'block' },
  },
} satisfies SxStyles;
