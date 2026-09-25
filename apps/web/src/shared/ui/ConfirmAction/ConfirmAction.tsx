import { useState } from 'react';
import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import { getApiErrorMessage } from '@/shared/lib';

interface ConfirmActionProps {
  /** Вопрос в заголовке: «Удалить факт?». */
  question: ReactNode;
  /** Чем это обернётся — если последствие не очевидно из вопроса. */
  description?: ReactNode;
  /** Надпись на подтверждающей кнопке. */
  confirmLabel?: string;
  /** Красная кнопка — для удаления и прочего необратимого. */
  destructive?: boolean;
  /**
   * Само действие. Если вернуло промис — диалог ждёт его с крутилкой на
   * кнопке и закрывается только после успеха; ошибка остаётся в диалоге,
   * чтобы можно было повторить.
   */
  onConfirm: () => void | Promise<unknown>;
  /** Текст ошибки, если backend не прислал свой. */
  errorText?: string;
  /** Триггер: получает функцию, открывающую диалог. */
  children: (ask: () => void) => ReactNode;
}

/**
 * Подтверждение действия, которое нельзя или трудно отменить.
 *
 * Заменяет `window.confirm`: тот блокирует вкладку, выглядит системным
 * окном браузера и не даёт ни пояснения, ни осмысленных надписей на кнопках.
 * Триггер передаётся функцией, поэтому одинаково работает и с кнопкой,
 * и с иконкой в строке таблицы, и с пунктом меню.
 */
export function ConfirmAction({
  question,
  description,
  confirmLabel = 'Подтвердить',
  destructive = false,
  onConfirm,
  errorText = 'Не получилось. Попробуйте ещё раз.',
  children,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const ask = () => {
    setError(null);
    setOpen(true);
  };

  const close = () => {
    // Пока действие выполняется, закрыть нельзя: иначе результат потеряется.
    if (!pending) setOpen(false);
  };

  const confirm = async () => {
    const result = onConfirm();
    if (!(result instanceof Promise)) {
      setOpen(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await result;
      setOpen(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {children(ask)}
      <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
        <DialogTitle>{question}</DialogTitle>
        {(description || error !== null) && (
          <DialogContent>
            <Stack spacing={2}>
              {error !== null && (
                <Alert severity="error">
                  {getApiErrorMessage(error, errorText)}
                </Alert>
              )}
              {description && (
                <DialogContentText component="div">
                  {description}
                </DialogContentText>
              )}
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          {/* У необратимого по умолчанию в фокусе «Отмена»: Enter не удалит. */}
          <Button onClick={close} disabled={pending} autoFocus={destructive}>
            Отмена
          </Button>
          <Button
            variant="contained"
            color={destructive ? 'error' : 'primary'}
            loading={pending}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
