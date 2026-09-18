import type { SxStyles } from '@/shared/types'

export const aiSettingsStyles = {
  /** Поля, которым широкая колонка не нужна: переключатель режима, адресат, таймзона. */
  narrowField: {
    maxWidth: 420,
  },
  footer: {
    alignItems: 'center',
  },
} satisfies SxStyles
