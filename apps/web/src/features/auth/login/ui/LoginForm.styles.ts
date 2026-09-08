import type { SxStyles } from '@/shared/types'

export const loginFormStyles = {
  rememberMe: {
    // Компенсирует пустой helperText поля пароля, который держит высоту формы.
    mt: -1,
    alignSelf: 'flex-start',
  },
} satisfies SxStyles
