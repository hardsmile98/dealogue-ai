import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import type { TelegramAccount } from '@/entities/telegram-account';
import { useConnectFlow } from '../model/useConnectFlow';
import type { InputStep } from '../model/useConnectFlow';
import { connectAccountDialogStyles as styles } from './ConnectAccountDialog.styles';
import { CodeStep } from './steps/CodeStep';
import { DoneStep } from './steps/DoneStep';
import { PasswordStep } from './steps/PasswordStep';
import { PhoneStep } from './steps/PhoneStep';

interface ConnectAccountDialogProps {
  open: boolean;
  onClose: () => void;
  /** Подставить номер — для сценария «переподключить». */
  initialPhone?: string;
  /** Вызывается после успешного входа; диалог остаётся открытым до «Готово». */
  onConnected?: (account: TelegramAccount) => void;
  /** Кнопка «Открыть аккаунт» на финальном шаге. */
  onOpenAccount?: (account: TelegramAccount) => void;
}

const STEP_LABELS: Record<InputStep, string> = {
  phone: 'Телефон',
  code: 'Код из Telegram',
  password: 'Облачный пароль',
};

/**
 * Подключение аккаунта пользователя Telegram: как в самом Telegram —
 * номер, код из приложения, при включённой 2FA — облачный пароль.
 * Состояние шагов живёт во вложенном компоненте: Dialog размонтирует его
 * при закрытии, так что каждое открытие начинается с чистого листа.
 * Клик мимо диалога его не закрывает — введённый код не теряется случайно.
 */
export function ConnectAccountDialog({
  open,
  onClose,
  ...flowProps
}: ConnectAccountDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (reason !== 'backdropClick') onClose();
      }}
      fullWidth
      maxWidth="xs"
    >
      <ConnectAccountFlow onClose={onClose} {...flowProps} />
    </Dialog>
  );
}

type ConnectAccountFlowProps = Omit<ConnectAccountDialogProps, 'open'>;

function ConnectAccountFlow({
  onClose,
  initialPhone = '',
  onConnected,
  onOpenAccount,
}: ConnectAccountFlowProps) {
  const flow = useConnectFlow({ initialPhone, onConnected });
  const { step, account, isLoading } = flow;

  return (
    <>
      <DialogTitle>
        {step === 'done'
          ? 'Аккаунт подключён'
          : 'Подключение аккаунта Telegram'}
      </DialogTitle>

      <Box
        component="form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void flow.submit();
        }}
      >
        <DialogContent>
          <Stepper
            activeStep={flow.activeIndex}
            alternativeLabel
            sx={styles.stepper}
          >
            {flow.steps.map((key) => (
              <Step key={key}>
                <StepLabel>{STEP_LABELS[key]}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Stack spacing={2}>
            {flow.error && (
              <Alert severity="error" onClose={flow.clearError}>
                {flow.error}
              </Alert>
            )}

            {step === 'phone' && (
              <PhoneStep
                phone={flow.phone}
                onChange={flow.setPhone}
                disabled={isLoading}
              />
            )}
            {step === 'code' && (
              <CodeStep
                phone={flow.phone}
                code={flow.code}
                onChange={flow.setCode}
                onChangePhone={flow.backToPhone}
                disabled={isLoading}
              />
            )}
            {step === 'password' && (
              <PasswordStep
                password={flow.password}
                onChange={flow.setPassword}
                disabled={isLoading}
              />
            )}
            {step === 'done' && account && <DoneStep account={account} />}
          </Stack>
        </DialogContent>

        <DialogActions>
          {step === 'done' && account ? (
            <>
              <Button onClick={onClose}>Готово</Button>
              {onOpenAccount && (
                <Button
                  variant="contained"
                  onClick={() => onOpenAccount(account)}
                >
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
                disabled={!flow.canSubmit}
              >
                {step === 'phone' ? 'Получить код' : 'Подтвердить'}
              </Button>
            </>
          )}
        </DialogActions>
      </Box>
    </>
  );
}
