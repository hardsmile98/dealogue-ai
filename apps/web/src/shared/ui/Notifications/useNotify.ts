import { useContext } from 'react';
import { NotificationsContext } from './context';
import type { Notifier } from './context';

/** Показать уведомление о результате действия: `notify.success('Сохранено')`. */
export function useNotify(): Notifier {
  const notifier = useContext(NotificationsContext);
  if (!notifier) {
    throw new Error('useNotify: нет NotificationsProvider выше по дереву');
  }
  return notifier;
}
