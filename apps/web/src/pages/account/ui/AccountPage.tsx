import { useState } from 'react'
import { Link as RouterLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined'
import { ROUTES, accountLinks } from '@/shared/config'
import { formatPhone, formatRelative, getApiErrorMessage } from '@/shared/lib'
import { EmptyState, PageHeader } from '@/shared/ui'
import {
  AccountAvatar,
  AccountStatusChip,
  needsReconnect,
  useGetAccountQuery,
} from '@/entities/telegram-account'
import { ConnectAccountDialog } from '@/features/telegram-account/connect'
import { RemoveAccountButton } from '@/features/telegram-account/remove'
import { accountPageStyles as styles } from './AccountPage.styles'

type AccountTab = 'stats' | 'chats'

/** Шапка аккаунта и вкладки; содержимое вкладки — во вложенном роуте. */
export function AccountPage() {
  const { accountId = '' } = useParams<{ accountId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [reconnectOpen, setReconnectOpen] = useState(false)

  const { data: account, isLoading, error } = useGetAccountQuery(accountId, {
    skip: accountId === '',
  })

  const tab: AccountTab = location.pathname.includes('/chats') ? 'chats' : 'stats'

  if (error) {
    return (
      <EmptyState
        title="Аккаунт не найден"
        description={getApiErrorMessage(error, 'Возможно, он был удалён.')}
        action={
          <Button component={RouterLink} to={ROUTES.accounts} variant="outlined">
            К списку аккаунтов
          </Button>
        }
      />
    )
  }

  return (
    <Box>
      <Box component={RouterLink} to={ROUTES.accounts} sx={styles.backLink}>
        <ArrowBackIcon />
        Аккаунты
      </Box>

      {isLoading || !account ? (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
          <Skeleton variant="circular" width={56} height={56} />
          <Box sx={{ flexGrow: 1 }}>
            <Skeleton width={240} height={36} />
            <Skeleton width={180} />
          </Box>
        </Stack>
      ) : (
        <>
          <PageHeader
            title={
              <Box sx={styles.titleRow}>
                <AccountAvatar name={account.displayName} size={48} />
                <span>{account.displayName}</span>
                <AccountStatusChip status={account.status} />
              </Box>
            }
            subtitle={
              <Typography component="span" variant="body2" sx={styles.meta}>
                {[account.username ? `@${account.username}` : null, formatPhone(account.phone)]
                  .filter(Boolean)
                  .join(' · ')}
                {account.lastSyncAt && ` · синхронизация ${formatRelative(account.lastSyncAt)}`}
              </Typography>
            }
            actions={
              <>
                {needsReconnect(account.status) && (
                  <Button variant="contained" onClick={() => setReconnectOpen(true)}>
                    Переподключить
                  </Button>
                )}
                <RemoveAccountButton
                  account={account}
                  variant="button"
                  onRemoved={() => navigate(ROUTES.accounts, { replace: true })}
                />
              </>
            }
          />

          {account.statusMessage && (
            <Alert
              severity={account.status === 'error' ? 'error' : 'warning'}
              sx={styles.statusAlert}
            >
              {account.statusMessage}
            </Alert>
          )}

          <Tabs value={tab} sx={styles.tabs}>
            <Tab
              value="stats"
              component={RouterLink}
              to={accountLinks.stats(account.id)}
              label={
                <Box sx={styles.tabLabel}>
                  <InsightsOutlinedIcon fontSize="small" />
                  Статистика
                </Box>
              }
            />
            <Tab
              value="chats"
              component={RouterLink}
              to={accountLinks.chats(account.id)}
              label={
                <Box sx={styles.tabLabel}>
                  <ForumOutlinedIcon fontSize="small" />
                  Чаты
                </Box>
              }
            />
          </Tabs>

          <Outlet />

          <ConnectAccountDialog
            open={reconnectOpen}
            initialPhone={account.phone}
            onClose={() => setReconnectOpen(false)}
          />
        </>
      )}
    </Box>
  )
}
