import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import type { SnackbarCloseReason } from '@mui/material/Snackbar';
import { NotificationsContext } from './context';
import type { NotificationSeverity, Notifier } from './context';

interface Notification {
  id: number;
  message: string;
  severity: NotificationSeverity;
}

/** Ошибку читают дольше, чем «сохранено». */
const HIDE_AFTER_MS: Record<NotificationSeverity, number> = {
  success: 4_000,
  info: 5_000,
  warning: 7_000,
  error: 8_000,
};

let nextId = 0;

/**
 * Короткие уведомления о результате действия: «Образ сохранён», «Не удалось
 * удалить». Одно на экране: новое заменяет прежнее, а не копится стопкой.
 * Ошибки, без которых форму не исправить, по-прежнему показываются рядом
 * с полями — сюда идёт обратная связь на действия без своей формы.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Notification | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback(
    (severity: NotificationSeverity) => (message: string) => {
      nextId += 1;
      setCurrent({ id: nextId, message, severity });
      setOpen(true);
    },
    [],
  );

  const notifier = useMemo<Notifier>(
    () => ({
      success: show('success'),
      error: show('error'),
      info: show('info'),
      warning: show('warning'),
    }),
    [show],
  );

  const close = (_event?: unknown, reason?: SnackbarCloseReason) => {
    // Клик мимо не закрывает: человек мог не успеть прочитать ошибку.
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  return (
    <NotificationsContext.Provider value={notifier}>
      {children}
      <Snackbar
        key={current?.id}
        open={open}
        onClose={close}
        autoHideDuration={current ? HIDE_AFTER_MS[current.severity] : null}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {current ? (
          <Alert
            severity={current.severity}
            variant="filled"
            onClose={() => close()}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </NotificationsContext.Provider>
  );
}
