import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import { ROUTES, accountLinks } from '@/shared/config'
import type { RealtimeEvent } from '@/shared/api'
import { ALERT_TYPE_META } from '@/entities/alert'
import { showBrowserNotification } from '../lib/notify'
import { useRealtimeEvents } from '../model/useRealtimeEvents'

interface Toast {
  key: number
  title: string
  severity: 'success' | 'warning' | 'error'
  to: string
}

interface RealtimeProviderProps {
  children: ReactNode
}

/** Живые события для всей авторизованной части: инвалидация кэшей + тост на новый алерт. */
export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const navigate = useNavigate()
  const [toast, setToast] = useState<Toast | null>(null)

  const onEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type !== 'alert.created') return
      const meta = ALERT_TYPE_META[event.alertType as keyof typeof ALERT_TYPE_META]
      if (!meta) return
      const to = event.chatId ? accountLinks.chat(event.accountId, event.chatId) : ROUTES.attention
      setToast({ key: Date.now(), title: meta.label, severity: meta.color, to })
      showBrowserNotification(`Dealogue: ${meta.label}`, meta.description, () => navigate(to))
    },
    [navigate],
  )

  useRealtimeEvents(onEvent)

  return (
    <>
      {children}
      <Snackbar
        key={toast?.key}
        open={toast !== null}
        autoHideDuration={8000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            variant="filled"
            onClose={() => setToast(null)}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  setToast(null)
                  navigate(toast.to)
                }}
              >
                Открыть
              </Button>
            }
          >
            {toast.title}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  )
}
