import { useState } from 'react'
import type { FormEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import { formatPhone, getApiErrorMessage } from '@/shared/lib'
import type { TelegramAccount } from '@/entities/telegram-account'
import {
  useSendCodeMutation,
  useSignInMutation,
  useSubmitPasswordMutation,
} from '../api/connectApi'
import { connectAccountDialogStyles as styles } from './ConnectAccountDialog.styles'

type FlowStep = 'phone' | 'code' | 'password' | 'done'

interface ConnectAccountDialogProps {
  open: boolean
  onClose: () => void
  /** Подставить номер — для сценария «переподключить». */
  initialPhone?: string
  /** Вызывается после успешного входа; диалог остаётся открытым до «Готово». */
  onConnected?: (account: TelegramAccount) => void
  /** Кнопка «Открыть аккаунт» на финальном шаге. */
  onOpenAccount?: (account: TelegramAccount) => void
}

const STEP_LABELS: Record<Exclude<FlowStep, 'done'>, string> = {
  phone: 'Телефон',
  code: 'Код из Telegram',
  password: 'Облачный пароль',
}

/**
 * Подключение аккаунта пользователя Telegram: как в самом Telegram —
 * номер, код из приложения, при включённой 2FA — облачный пароль.
 * Состояние шагов живёт во вложенном компоненте: Dialog размонтирует его
 * при закрытии, так что каждое открытие начинается с чистого листа.
 */
export function ConnectAccountDialog({ open, onClose, ...flowProps }: ConnectAccountDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: styles.paper } }}
    >
      <ConnectAccountFlow onClose={onClose} {...flowProps} />
    </Dialog>
  )
}

type ConnectAccountFlowProps = Omit<ConnectAccountDialogProps, 'open'>

function ConnectAccountFlow({
  onClose,
  initialPhone = '',
  onConnected,
  onOpenAccount,
}: ConnectAccountFlowProps) {
  const [step, setStep] = useState<FlowStep>('phone')
  const [phone, setPhone] = useState(initialPhone)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [account, setAccount] = useState<TelegramAccount | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [sendCode, sendCodeState] = useSendCodeMutation()
  const [signIn, signInState] = useSignInMutation()
  const [submitPassword, submitPasswordState] = useSubmitPasswordMutation()
  const isLoading =
    sendCodeState.isLoading || signInState.isLoading || submitPasswordState.isLoading

  const steps: Exclude<FlowStep, 'done'>[] = passwordRequired
    ? ['phone', 'code', 'password']
    : ['phone', 'code']
  const activeIndex = step === 'done' ? steps.length : steps.indexOf(step)

  const finish = (connected: TelegramAccount) => {
    setAccount(connected)
    setStep('done')
    onConnected?.(connected)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    try {
      if (step === 'phone') {
        const result = await sendCode({ phone: phone.trim() }).unwrap()
        setAttemptId(result.attemptId)
        setPhone(result.phone)
        setStep('code')
        return
      }

      if (step === 'code' && attemptId) {
        const result = await signIn({ attemptId, code: code.trim() }).unwrap()
        if (result.status === 'password_required') {
          setPasswordRequired(true)
          setStep('password')
          return
        }
        finish(result.account)
        return
      }

      if (step === 'password' && attemptId) {
        const result = await submitPassword({ attemptId, password }).unwrap()
        finish(result.account)
      }
    } catch (caught) {
      setError(getApiErrorMessage(caught))
    }
  }

  const submitDisabled =
    (step === 'phone' && phone.trim().length < 10) ||
    (step === 'code' && code.length < 5) ||
    (step === 'password' && password.length === 0)

  return (
    <>
      <DialogTitle>
        {step === 'done' ? 'Аккаунт подключён' : 'Подключение аккаунта Telegram'}
      </DialogTitle>

      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <Stepper activeStep={activeIndex} alternativeLabel sx={styles.stepper}>
            {steps.map((key) => (
              <Step key={key}>
                <StepLabel>{STEP_LABELS[key]}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Stack spacing={2}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {step === 'phone' && (
              <>
                <Typography variant="body2" sx={styles.hint}>
                  Укажите номер аккаунта, сообщения которого нужно отслеживать. Telegram
                  пришлёт код подтверждения в приложение на этом номере.
                </Typography>
                <TextField
                  label="Номер телефона"
                  placeholder="+7 999 123-45-67"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoFocus
                  fullWidth
                  disabled={isLoading}
                  slotProps={{ htmlInput: { inputMode: 'tel', autoComplete: 'tel' } }}
                />
              </>
            )}

            {step === 'code' && (
              <>
                <Typography variant="body2" sx={styles.hint}>
                  Код отправлен в Telegram на номер{' '}
                  <Box component="span" sx={styles.phoneEcho}>
                    {formatPhone(phone)}
                  </Box>
                  . Введите его — обычно это 5 цифр.
                </Typography>
                <TextField
                  label="Код подтверждения"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  autoFocus
                  fullWidth
                  disabled={isLoading}
                  slotProps={{
                    htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code' },
                  }}
                />
                <Button
                  size="small"
                  onClick={() => {
                    setStep('phone')
                    setError(null)
                  }}
                  disabled={isLoading}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Изменить номер
                </Button>
              </>
            )}

            {step === 'password' && (
              <>
                <Typography variant="body2" sx={styles.hint}>
                  В аккаунте включена двухэтапная аутентификация. Введите облачный
                  пароль Telegram — мы не сохраняем его, только сессию.
                </Typography>
                <TextField
                  label="Облачный пароль"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                  fullWidth
                  disabled={isLoading}
                  slotProps={{ htmlInput: { autoComplete: 'current-password' } }}
                />
              </>
            )}

            {step === 'done' && account && (
              <Stack spacing={1} sx={styles.done}>
                <CheckCircleOutlinedIcon sx={styles.doneIcon} />
                <Typography variant="h6">{account.displayName}</Typography>
                <Typography variant="body2" sx={styles.hint}>
                  {formatPhone(account.phone)}. Начинаем синхронизацию чатов — первые сообщения
                  появятся в статистике через пару минут.
                </Typography>
              </Stack>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={styles.actions}>
          {step === 'done' && account ? (
            <>
              <Button onClick={onClose}>Готово</Button>
              {onOpenAccount && (
                <Button variant="contained" onClick={() => onOpenAccount(account)}>
                  Открыть аккаунт
                </Button>
              )}
            </>
          ) : (
            <>
              <Button onClick={onClose} disabled={isLoading}>
                Отмена
              </Button>
              <Button
                type="submit"
                variant="contained"
                loading={isLoading}
                disabled={submitDisabled}
              >
                {step === 'phone' ? 'Получить код' : 'Подтвердить'}
              </Button>
            </>
          )}
        </DialogActions>
      </Box>
    </>
  )
}
