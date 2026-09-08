import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { accountLinks } from '@/shared/config'
import { formatNumber, formatPhone, formatRelative } from '@/shared/lib'
import {
  AccountAvatar,
  AccountStatusChip,
  needsReconnect,
} from '@/entities/telegram-account'
import type { TelegramAccount } from '@/entities/telegram-account'
import { RemoveAccountButton } from '@/features/telegram-account/remove'
import { accountsPageStyles as styles } from './AccountsPage.styles'

interface AccountsTableProps {
  accounts: TelegramAccount[] | undefined
  isLoading: boolean
  onReconnect: (account: TelegramAccount) => void
}

export function AccountsTable({ accounts, isLoading, onReconnect }: AccountsTableProps) {
  const navigate = useNavigate()

  return (
    <Table sx={styles.table}>
      <TableHead>
        <TableRow>
          <TableCell>Аккаунт</TableCell>
          <TableCell sx={styles.statusCell}>Статус</TableCell>
          <TableCell align="right" sx={styles.numberHead}>
            Новых сегодня
          </TableCell>
          <TableCell>Синхронизация</TableCell>
          <TableCell align="right" />
        </TableRow>
      </TableHead>
      <TableBody>
        {isLoading &&
          [0, 1, 2].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <Box sx={styles.accountCell}>
                  <Skeleton variant="circular" width={40} height={40} />
                  <Box sx={{ flexGrow: 1 }}>
                    <Skeleton width="50%" />
                    <Skeleton width="70%" />
                  </Box>
                </Box>
              </TableCell>
              <TableCell>
                <Skeleton width={110} />
              </TableCell>
              <TableCell align="right">
                <Skeleton width={32} sx={{ ml: 'auto' }} />
              </TableCell>
              <TableCell>
                <Skeleton width={90} />
              </TableCell>
              <TableCell />
            </TableRow>
          ))}

        {accounts?.map((account) => {
          const open = () => navigate(accountLinks.root(account.id))
          const meta = [account.username ? `@${account.username}` : null, formatPhone(account.phone)]
            .filter(Boolean)
            .join(' · ')
          const isConnected = account.status === 'connected'
          return (
            <TableRow key={account.id} hover onClick={open} sx={styles.row}>
              <TableCell>
                <Box sx={styles.accountCell}>
                  <AccountAvatar name={account.displayName} />
                  <Box>
                    <Typography sx={styles.accountName}>{account.displayName}</Typography>
                    <Typography sx={styles.accountMeta}>{meta}</Typography>
                  </Box>
                </Box>
              </TableCell>
              <TableCell sx={styles.statusCell}>
                <AccountStatusChip status={account.status} />
                {account.statusMessage && (
                  <Tooltip title={account.statusMessage}>
                    <Typography component="span" sx={styles.statusMessage}>
                      {account.statusMessage}
                    </Typography>
                  </Tooltip>
                )}
              </TableCell>
              <TableCell align="right">
                <Typography component="span" sx={[styles.number, !isConnected && styles.muted]}>
                  {formatNumber(account.newChatsToday)}
                </Typography>
              </TableCell>
              <TableCell sx={styles.syncCell}>
                {account.lastSyncAt ? (
                  <Tooltip title={new Date(account.lastSyncAt).toLocaleString('ru-RU')}>
                    <Typography component="span" variant="body2" color="text.secondary">
                      {formatRelative(account.lastSyncAt)}
                    </Typography>
                  </Tooltip>
                ) : (
                  <Typography component="span" variant="body2" sx={styles.muted}>
                    ещё не было
                  </Typography>
                )}
              </TableCell>
              <TableCell align="right">
                <Box sx={styles.actions} onClick={(event) => event.stopPropagation()}>
                  {needsReconnect(account.status) && (
                    <Button size="small" variant="outlined" onClick={() => onReconnect(account)}>
                      Переподключить
                    </Button>
                  )}
                  <RemoveAccountButton account={account} />
                </Box>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
