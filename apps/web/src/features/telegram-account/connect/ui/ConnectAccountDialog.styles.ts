import type { SxStyles } from '@/shared/types'

export const connectAccountDialogStyles = {
  paper: {
    borderRadius: 3,
  },
  stepper: {
    mb: 3,
  },
  hint: {
    color: 'text.secondary',
  },
  phoneEcho: {
    fontWeight: 600,
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
  actions: {
    px: 3,
    pb: 3,
    pt: 0,
  },
} satisfies SxStyles
