import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import { getApiErrorMessage } from '@/shared/lib';
import { formDialogStyles as styles } from './FormDialog.styles';

interface FormDialogProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  /** Ошибка мутации: показывается под полями. */
  error?: unknown;
  errorText?: string;
  submitLabel?: string;
  cancelLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  maxWidth?: 'xs' | 'sm' | 'md';
  /** Поля формы. */
  children: ReactNode;
}

/**
 * Диалог создания или правки записи: поля, ошибка сохранения и две кнопки.
 *
 * Содержимое обёрнуто в `<form>`, поэтому Enter в поле отправляет форму,
 * а Esc закрывает диалог — раньше у каждого диалога это было по-своему.
 * Пока идёт сохранение, диалог не закрывается ни кнопкой, ни Esc.
 */
export function FormDialog({
  open,
  title,
  onClose,
  onSubmit,
  error,
  errorText = 'Не удалось сохранить',
  submitLabel = 'Сохранить',
  cancelLabel = 'Отмена',
  submitting = false,
  submitDisabled = false,
  maxWidth = 'sm',
  children,
}: FormDialogProps) {
  const close = () => {
    if (!submitting) onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth={maxWidth}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitting && !submitDisabled) onSubmit();
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={styles.fields}>
            {children}
            {error !== undefined && error !== null && (
              <Alert severity="error">
                {getApiErrorMessage(error, errorText)}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={submitting}>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            variant="contained"
            loading={submitting}
            disabled={submitDisabled}
          >
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
