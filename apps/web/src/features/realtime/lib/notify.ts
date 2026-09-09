const MUTE_KEY = 'dealogue.notifications.muted'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function isMuted(): boolean {
  return storage()?.getItem(MUTE_KEY) === '1'
}

export function setMuted(muted: boolean): void {
  try {
    if (muted) storage()?.setItem(MUTE_KEY, '1')
    else storage()?.removeItem(MUTE_KEY)
  } catch {
    // недоступно — не страшно
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/** Запрашивать разрешение можно только по жесту пользователя. */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/** Браузерное уведомление без звука; молча ничего не делает, если нельзя. */
export function showBrowserNotification(title: string, body: string, onClick?: () => void): void {
  if (isMuted() || !notificationsSupported() || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && document.hasFocus()) return
  try {
    const notification = new Notification(title, { body, silent: true, tag: `dealogue-${Date.now()}` })
    if (onClick) {
      notification.onclick = () => {
        window.focus()
        onClick()
        notification.close()
      }
    }
  } catch {
    // некоторые браузеры бросают при создании из не-worker контекста
  }
}
