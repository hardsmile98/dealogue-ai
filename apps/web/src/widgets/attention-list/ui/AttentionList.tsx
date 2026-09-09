import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined'
import { accountLinks } from '@/shared/config'
import { formatRelative, getApiErrorMessage } from '@/shared/lib'
import { EmptyState } from '@/shared/ui'
import type { AlertDto } from '@/shared/api'
import { ALERT_STATUS_LABELS, AlertTypeChip, useGetAlertsQuery } from '@/entities/alert'
import { AccountAvatar } from '@/entities/telegram-account'
import { AlertActions } from '@/features/alerts/manage'

interface AttentionListProps {
  /** Показывать закрытые тоже. */
  includeResolved?: boolean
}

/** Список алертов по всем аккаунтам: кто готов платить, где нужен человек, где ИИ упал. */
export function AttentionList({ includeResolved = false }: AttentionListProps) {
  const { data, isLoading, error } = useGetAlertsQuery(
    { status: includeResolved ? 'open,acknowledged,resolved' : 'open,acknowledged' },
    { pollingInterval: 30_000 },
  )

  if (error) {
    return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить алерты')}</Alert>
  }

  if (isLoading) {
    return (
      <Stack spacing={1.5}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={96} sx={{ borderRadius: 3 }} />
        ))}
      </Stack>
    )
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<NotificationsNoneOutlinedIcon />}
        title="Пока ничего не требует внимания"
        description="Когда ИИ доведёт клиента до оплаты или не сможет ответить сам, чат появится здесь и в списке чатов с пометкой."
      />
    )
  }

  return (
    <Stack spacing={1.5}>
      {data.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
    </Stack>
  )
}

function AlertCard({ alert }: { alert: AlertDto }) {
  const chatLink = alert.chatId ? accountLinks.chat(alert.accountId, alert.chatId) : accountLinks.ai(alert.accountId)
  const who = alert.chat
    ? [alert.chat.peerName, alert.chat.peerUsername ? `@${alert.chat.peerUsername}` : null].filter(Boolean).join(' ')
    : 'Аккаунт'
  return (
    <Card variant="outlined" sx={{ p: 2, borderRadius: 3, opacity: alert.status === 'resolved' ? 0.6 : 1 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <AccountAvatar name={alert.chat?.peerName ?? alert.account?.displayName ?? '?'} size={44} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
            <AlertTypeChip type={alert.type} />
            <Chip size="small" variant="outlined" label={ALERT_STATUS_LABELS[alert.status]} />
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{formatRelative(alert.createdAt)}</Typography>
          </Stack>
          <Typography sx={{ fontWeight: 600 }}>{who}</Typography>
          {alert.account && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              аккаунт {alert.account.displayName}
            </Typography>
          )}
          {alert.payload.lastClientText && (
            <Typography sx={{ fontSize: 13, mt: 0.75, fontStyle: 'italic', color: 'text.secondary' }}>
              «{alert.payload.lastClientText}»
            </Typography>
          )}
          {alert.payload.error && (
            <Typography sx={{ fontSize: 13, mt: 0.75, color: 'error.main' }}>{alert.payload.error}</Typography>
          )}
          {alert.payload.reason && !alert.payload.error && (
            <Typography sx={{ fontSize: 12, mt: 0.5, color: 'text.secondary' }}>{alert.payload.reason}</Typography>
          )}
        </Box>
        <Stack spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'flex-end' }, flexShrink: 0 }}>
          <Button component={RouterLink} to={chatLink} variant="outlined" size="small">
            {alert.chatId ? 'Открыть чат' : 'Настройки ИИ'}
          </Button>
          <AlertActions alert={alert} />
        </Stack>
      </Stack>
    </Card>
  )
}
