import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useDispatch } from 'react-redux'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import { sessionEstablished } from '@/entities/session'
import { useLoginMutation } from '../api/loginApi'
import { getLoginErrorMessage } from '../lib/getLoginErrorMessage'
import type { Credentials } from '../model/types'
import { hasErrors, validateCredentials } from '../model/validation'
import type { LoginFormErrors } from '../model/validation'
import { loginFormStyles } from './LoginForm.styles'

const EMPTY_CREDENTIALS: Credentials = { login: '', password: '' }

export function LoginForm() {
  const dispatch = useDispatch()
  const [login, { isLoading }] = useLoginMutation()

  const [values, setValues] = useState<Credentials>(EMPTY_CREDENTIALS)
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [wasSubmitted, setWasSubmitted] = useState(false)
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleChange =
    (field: keyof Credentials) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = { ...values, [field]: event.target.value }
      setValues(next)
      setSubmitError(null)
      // Пока форму не отправляли — не пугаем пользователя ошибками во время ввода.
      if (wasSubmitted) setErrors(validateCredentials(next))
    }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setWasSubmitted(true)

    const nextErrors = validateCredentials(values)
    setErrors(nextErrors)
    if (hasErrors(nextErrors)) return

    setSubmitError(null)
    try {
      const session = await login(values).unwrap()
      // Дальше сработает GuestRoute и уведёт с /login на защищённый маршрут.
      dispatch(sessionEstablished({ session, remember }))
    } catch (error) {
      setSubmitError(getLoginErrorMessage(error))
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2}>
        {submitError && (
          <Alert severity="error" onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        <TextField
          label="Логин"
          name="login"
          value={values.login}
          onChange={handleChange('login')}
          error={Boolean(errors.login)}
          helperText={errors.login ?? ' '}
          autoComplete="username"
          autoFocus
          fullWidth
          disabled={isLoading}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <PersonOutlinedIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
        />

        <TextField
          label="Пароль"
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={values.password}
          onChange={handleChange('password')}
          error={Boolean(errors.password)}
          helperText={errors.password ?? ' '}
          autoComplete="current-password"
          fullWidth
          disabled={isLoading}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlinedIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((visible) => !visible)}
                    edge="end"
                    disabled={isLoading}
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  >
                    {showPassword ? (
                      <VisibilityOffIcon fontSize="small" />
                    ) : (
                      <VisibilityIcon fontSize="small" />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />

        <FormControlLabel
          control={
            <Checkbox
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              disabled={isLoading}
              size="small"
            />
          }
          label="Запомнить меня"
          slotProps={{ typography: { variant: 'body2' } }}
          sx={loginFormStyles.rememberMe}
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          loading={isLoading}
        >
          Войти
        </Button>
      </Stack>
    </Box>
  )
}
