import { createContext } from 'react';

export type NotificationSeverity = 'success' | 'error' | 'info' | 'warning';

export interface Notifier {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

export const NotificationsContext = createContext<Notifier | null>(null);
