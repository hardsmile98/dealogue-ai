import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined'
import { accountLinks } from '@/shared/config'
import { formatRelative } from '@/shared/lib'
import { EmptyState, QueryBoundary } from '@/shared/ui'
import type { AlertDto } from '@/shared/api'
import {
  ALERT_STATUS_LABELS,
  AlertTypeChip,
  HANDOFF_REASON_LABELS,
  useGetAlertsQuery,
} from '@/entities/alert'
import { AccountAvatar } from '@/entities/telegram-account'
import { AlertActions } from '@/features/alerts/manage'
import { attentionListStyles as styles } from './AttentionList.styles'

interface AttentionListProps {
  /** Показывать закрытые тоже. */
  includeResolved?: boolean
}

/** Список алертов по всем аккаунтам: кто готов платить, где нужен человек, где ИИ упал. */
export function AttentionList({ includeResolved = false }: AttentionListProps) {
  const query = useGetAlertsQuery(
    { status: includeResolved ? 'open,acknowledged,resolved' : 'open,acknowledged' },
    { pollingInterval: 30_000 },
  )

  return (
    <QueryBoundary
      query={query}
      errorText="Не удалось загрузить алерты"
      skeleton={
        <Stack spacing={1.5}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} variant="rounded" height={96} />
          ))}
        </Stack>
      }
      empty={
        <EmptyState
          icon={<NotificationsNoneOutlinedIcon />}
          title="Пока ничего не требует внимания"
          description="Когда бот передаст чат менеджеру, наткнётся на медиа или несовершеннолетнего, либо сломается провайдер, чат появится здесь и в списке чатов с пометкой."
        />
      }
    >
      {(alerts) => (
        <Stack spacing={1.5}>
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </Stack>
      )}
    </QueryBoundary>
  )
}

function AlertCard({ alert }: { alert: AlertDto }) {
  // Алерт без чата — про аккаунт целиком (например, упал провайдер).
  const chatLink = alert.chatId
    ? accountLinks.chat(alert.accountId, alert.chatId)
    : accountLinks.ai(alert.accountId)
  const who = alert.chat
    ? [alert.chat.peerName, alert.chat.peerUsername ? `@${alert.chat.peerUsername}` : null]
        .filter(Boolean)
        .join(' ')
    : 'Аккаунт'

  return (
    <Card variant="outlined" sx={alert.status === 'resolved' ? styles.resolvedCard : styles.card}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={styles.row}>
        <AccountAvatar name={alert.chat?.peerName ?? alert.account?.displayName ?? '?'} size={44} />
        <Box sx={styles.body}>
          <Stack direction="row" spacing={1} sx={styles.chips}>
            <AlertTypeChip type={alert.type} />
            <Chip size="small" variant="outlined" label={ALERT_STATUS_LABELS[alert.status]} />
            <Typography sx={styles.meta}>{formatRelative(alert.createdAt)}</Typography>
          </Stack>
          <Typography sx={styles.who}>{who}</Typography>
          {alert.account && <Typography sx={styles.meta}>аккаунт {alert.account.displayName}</Typography>}
          {alert.payload.lastClientText && (
            <Typography sx={styles.quote}>«{alert.payload.lastClientText}»</Typography>
          )}
          {alert.payload.error && <Typography sx={styles.error}>{alert.payload.error}</Typography>}
          {alert.payload.reason && !alert.payload.error && (
            <Typography sx={styles.metaLine}>
              Причина: {HANDOFF_REASON_LABELS[alert.payload.reason] ?? alert.payload.reason}
            </Typography>
          )}
          {alert.payload.detail && <Typography sx={styles.metaLine}>{alert.payload.detail}</Typography>}
        </Box>
        <Stack spacing={1} sx={styles.actions}>
          <Button component={RouterLink} to={chatLink} variant="outlined" size="small">
            {alert.chatId ? 'Открыть чат' : 'Настройки ИИ'}
          </Button>
          <AlertActions alert={alert} />
        </Stack>
      </Stack>
    </Card>
  )
}
