import { useState } from 'react'
import type { ReactNode } from 'react'
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
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined'
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
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

type AccountTab = 'stats' | 'chats' | 'handoffs' | 'bot' | 'sandbox'

/** Вкладки аккаунта: подпись, иконка и как собрать ссылку. */
const TABS: { key: AccountTab; label: string; icon: ReactNode; link: (accountId: string) => string }[] = [
  {
    key: 'stats',
    label: 'Статистика',
    icon: <InsightsOutlinedIcon fontSize="small" />,
    link: accountLinks.stats,
  },
  { key: 'chats', label: 'Чаты', icon: <ForumOutlinedIcon fontSize="small" />, link: accountLinks.chats },
  {
    key: 'handoffs',
    label: 'У менеджера',
    icon: <SupportAgentOutlinedIcon fontSize="small" />,
    link: accountLinks.handoffs,
  },
  { key: 'bot', label: 'Агент', icon: <SmartToyOutlinedIcon fontSize="small" />, link: accountLinks.bot },
  {
    key: 'sandbox',
    label: 'Песочница',
    icon: <ScienceOutlinedIcon fontSize="small" />,
    link: (accountId) => accountLinks.sandbox(accountId),
  },
]

/** Шапка аккаунта и вкладки; содержимое вкладки — во вложенном роуте. */
export function AccountPage() {
  const { accountId = '' } = useParams<{ accountId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [reconnectOpen, setReconnectOpen] = useState(false)

  const { data: account, isLoading, error } = useGetAccountQuery(accountId, {
    skip: accountId === '',
    pollingInterval: 30_000,
  })

  const tab: AccountTab =
    TABS.find((item) => item.key !== 'stats' && location.pathname.includes(`/${item.key}`))?.key ?? 'stats'

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
        <Stack direction="row" spacing={2} sx={styles.headerSkeleton}>
          <Skeleton variant="circular" width={56} height={56} />
          <Box sx={styles.headerSkeletonText}>
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
            {TABS.map((item) => (
              <Tab
                key={item.key}
                value={item.key}
                component={RouterLink}
                to={item.link(account.id)}
                label={
                  <Box sx={styles.tabLabel}>
                    {item.icon}
                    {item.label}
                  </Box>
                }
              />
            ))}
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
