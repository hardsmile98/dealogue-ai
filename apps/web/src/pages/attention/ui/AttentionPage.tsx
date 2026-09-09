import { useState } from 'react'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Stack from '@mui/material/Stack'
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import { PageHeader } from '@/shared/ui'
import {
  isMuted,
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
  setMuted,
} from '@/features/realtime'
import { AttentionList } from '@/widgets/attention-list'

/** Раздел «Требуют внимания»: алерты ИИ-агента по всем аккаунтам. */
export function AttentionPage() {
  const [includeResolved, setIncludeResolved] = useState(false)
  const [muted, setMutedState] = useState(isMuted())
  const [permission, setPermission] = useState(notificationPermission())

  const toggleMute = (next: boolean) => {
    setMuted(next)
    setMutedState(next)
  }

  const enableBrowser = async () => {
    setPermission(await requestNotificationPermission())
  }

  return (
    <>
      <PageHeader
        title="Требуют внимания"
        subtitle="Клиенты, которых ИИ довёл до оплаты, чаты, где нужен человек, и ошибки ИИ."
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {notificationsSupported() && permission === 'default' && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<NotificationsActiveOutlinedIcon />}
                onClick={() => void enableBrowser()}
              >
                Уведомления браузера
              </Button>
            )}
            {permission === 'granted' && (
              <Button
                size="small"
                variant="text"
                startIcon={muted ? <NotificationsActiveOutlinedIcon /> : <NotificationsOffOutlinedIcon />}
                onClick={() => toggleMute(!muted)}
              >
                {muted ? 'Включить уведомления' : 'Не беспокоить'}
              </Button>
            )}
            <FormControlLabel
              control={
                <Switch size="small" checked={includeResolved} onChange={(e) => setIncludeResolved(e.target.checked)} />
              }
              label="Показывать закрытые"
              sx={{ mr: 0 }}
            />
          </Stack>
        }
      />
      <AttentionList includeResolved={includeResolved} />
    </>
  )
}
