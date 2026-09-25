import type { SxStyles } from '@/shared/types';

export const connectAccountDialogStyles = {
  stepper: {
    mb: 3,
  },
  hint: {
    color: 'text.secondary',
  },
  phoneEcho: {
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  changePhone: {
    alignSelf: 'flex-start',
  },
  done: {
    alignItems: 'center',
    textAlign: 'center',
    py: 2,
  },
  doneIcon: {
    fontSize: 56,
    color: 'success.main',
  },
} satisfies SxStyles;
