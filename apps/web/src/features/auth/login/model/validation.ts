import type { Credentials } from './types'

export type LoginFormErrors = Partial<Record<keyof Credentials, string>>

const MIN_LOGIN_LENGTH = 3
const MIN_PASSWORD_LENGTH = 6

export function validateCredentials(values: Credentials): LoginFormErrors {
  const errors: LoginFormErrors = {}
  const login = values.login.trim()

  if (!login) {
    errors.login = 'Введите логин'
  } else if (login.length < MIN_LOGIN_LENGTH) {
    errors.login = `Минимум ${MIN_LOGIN_LENGTH} символа`
  }

  if (!values.password) {
    errors.password = 'Введите пароль'
  } else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Минимум ${MIN_PASSWORD_LENGTH} символов`
  }

  return errors
}

export function hasErrors(errors: LoginFormErrors): boolean {
  return Object.keys(errors).length > 0
}
