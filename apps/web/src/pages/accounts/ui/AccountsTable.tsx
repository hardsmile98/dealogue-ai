import { Link as RouterLink, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { accountLinks } from '@/shared/config';
import { formatDateTime, formatNumber, formatRelative } from '@/shared/lib';
import { visuallyHidden } from '@/shared/ui';
import {
  AccountAvatar,
  AccountStatusChip,
  formatContacts,
  needsReconnect,
} from '@/entities/telegram-account';
import type { TelegramAccount } from '@/entities/telegram-account';
import { RemoveAccountButton } from '@/features/telegram-account/remove';
import { accountsPageStyles as styles } from './AccountsPage.styles';

interface AccountsTableProps {
  /** undefined — список ещё грузится: в строках скелетоны. */
  accounts: TelegramAccount[] | undefined;
  onReconnect: (account: TelegramAccount) => void;
}

/**
 * Таблица аккаунтов. Строка открывает аккаунт по клику мышью, а для
 * клавиатуры и «открыть в новой вкладке» имя аккаунта — обычная ссылка.
 */
export function AccountsTable({ accounts, onReconnect }: AccountsTableProps) {
  return (
    <Table sx={styles.table} aria-label="Аккаунты Telegram">
      <TableHead>
        <TableRow>
          <TableCell>Аккаунт</TableCell>
          <TableCell sx={styles.statusCell}>Статус</TableCell>
          <TableCell align="right" sx={styles.numberHead}>
            Новых сегодня
          </TableCell>
          <TableCell sx={styles.syncCell}>Синхронизация</TableCell>
          <TableCell align="right">
            <Box component="span" sx={visuallyHidden}>
              Действия
            </Box>
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {accounts
          ? accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                onReconnect={onReconnect}
              />
            ))
          : [0, 1, 2].map((i) => <SkeletonRow key={i} />)}
      </TableBody>
    </Table>
  );
}

interface AccountRowProps {
  account: TelegramAccount;
  onReconnect: (account: TelegramAccount) => void;
}

function AccountRow({ account, onReconnect }: AccountRowProps) {
  const navigate = useNavigate();
  const link = accountLinks.root(account.id);
  const isConnected = account.status === 'connected';

  return (
    <TableRow hover onClick={() => navigate(link)} sx={styles.row}>
      <TableCell>
        <Box sx={styles.accountCell}>
          <AccountAvatar name={account.displayName} />
          <Box sx={styles.accountText}>
            <Typography
              component={RouterLink}
              to={link}
              sx={styles.accountName}
              // Клик по ссылке — та же навигация; строке второй раз не нужен.
              onClick={(event) => event.stopPropagation()}
            >
              {account.displayName}
            </Typography>
            <Typography sx={styles.accountMeta}>
              {formatContacts(account)}
            </Typography>
          </Box>
        </Box>
      </TableCell>
      <TableCell sx={styles.statusCell}>
        <AccountStatusChip status={account.status} />
        {account.statusMessage && (
          <Tooltip title={account.statusMessage} describeChild>
            <Typography component="span" sx={styles.statusMessage}>
              {account.statusMessage}
            </Typography>
          </Tooltip>
        )}
      </TableCell>
      <TableCell align="right">
        <Typography
          component="span"
          sx={[styles.number, !isConnected && styles.muted]}
        >
          {formatNumber(account.newChatsToday)}
        </Typography>
      </TableCell>
      <TableCell sx={styles.syncCell}>
        {account.lastSyncAt ? (
          <Tooltip title={formatDateTime(account.lastSyncAt)} describeChild>
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
        {/* Клики по кнопкам (и по их диалогам — события всплывают через портал)
            не должны открывать аккаунт. */}
        <Box sx={styles.actions} onClick={(event) => event.stopPropagation()}>
          {needsReconnect(account.status) && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => onReconnect(account)}
            >
              Переподключить
            </Button>
          )}
          <RemoveAccountButton account={account} />
        </Box>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <Box sx={styles.accountCell}>
          <Skeleton variant="circular" width={40} height={40} />
          <Box sx={styles.skeletonText}>
            <Skeleton width="50%" />
            <Skeleton width="70%" />
          </Box>
        </Box>
      </TableCell>
      <TableCell>
        <Skeleton width={110} />
      </TableCell>
      <TableCell align="right">
        <Skeleton width={32} sx={styles.skeletonRight} />
      </TableCell>
      <TableCell sx={styles.syncCell}>
        <Skeleton width={90} />
      </TableCell>
      <TableCell />
    </TableRow>
  );
}
