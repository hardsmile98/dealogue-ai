import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import AddIcon from '@mui/icons-material/Add';
import TelegramIcon from '@mui/icons-material/Telegram';
import { accountLinks } from '@/shared/config';
import { pluralize, useDocumentTitle } from '@/shared/lib';
import { EmptyState, PageHeader, QueryBoundary } from '@/shared/ui';
import {
  ACCOUNT_STATUS_META,
  useGetAccountsQuery,
} from '@/entities/telegram-account';
import type {
  AccountStatus,
  TelegramAccount,
} from '@/entities/telegram-account';
import { ConnectAccountDialog } from '@/features/telegram-account/connect';
import { AccountsTable } from './AccountsTable';
import { accountsPageStyles as styles } from './AccountsPage.styles';

/** Статусы и счётчики меняются в фоне (синхронизация, обрывы) — опрашиваем. */
const POLLING_INTERVAL_MS = 30_000;

const STATUS_ORDER: AccountStatus[] = [
  'connected',
  'pending',
  'disconnected',
  'error',
];

interface ConnectDialogState {
  open: boolean;
  /** Номер для «Переподключить»; пусто — новый аккаунт. */
  initialPhone: string;
}

/** Список подключённых аккаунтов Telegram — первый экран после входа. */
export function AccountsPage() {
  const navigate = useNavigate();
  const query = useGetAccountsQuery(undefined, {
    pollingInterval: POLLING_INTERVAL_MS,
  });
  const accounts = query.data;
  const [dialog, setDialog] = useState<ConnectDialogState>({
    open: false,
    initialPhone: '',
  });

  useDocumentTitle('Аккаунты');

  const openConnect = (initialPhone = '') =>
    setDialog({ open: true, initialPhone });
  const closeConnect = () => setDialog((state) => ({ ...state, open: false }));

  const connectButton = (
    <Button
      variant="contained"
      startIcon={<AddIcon />}
      onClick={() => openConnect()}
    >
      Подключить аккаунт
    </Button>
  );

  return (
    <Box>
      <PageHeader
        title="Аккаунты Telegram"
        subtitle={
          accounts
            ? `${pluralize(accounts.length, ['аккаунт', 'аккаунта', 'аккаунтов'])} под наблюдением`
            : 'Подключённые аккаунты и их состояние'
        }
        actions={connectButton}
      />

      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить аккаунты"
        skeleton={
          <AccountsCard>
            <AccountsTable accounts={undefined} onReconnect={() => undefined} />
          </AccountsCard>
        }
        empty={
          <AccountsCard>
            <EmptyState
              icon={<TelegramIcon />}
              title="Пока ни одного аккаунта"
              description="Подключите аккаунт Telegram — мы начнём собирать входящие сообщения и считать, с какими кодами приходят клиенты."
              action={connectButton}
            />
          </AccountsCard>
        }
      >
        {(list) => (
          <>
            <StatusSummary accounts={list} />
            <AccountsCard>
              <AccountsTable
                accounts={list}
                onReconnect={(account) => openConnect(account.phone)}
              />
            </AccountsCard>
          </>
        )}
      </QueryBoundary>

      <ConnectAccountDialog
        open={dialog.open}
        initialPhone={dialog.initialPhone}
        onClose={closeConnect}
        onOpenAccount={(account) => {
          closeConnect();
          navigate(accountLinks.root(account.id));
        }}
      />
    </Box>
  );
}

function AccountsCard({ children }: { children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={styles.tableCard}>
      <Box sx={styles.tableScroll}>{children}</Box>
    </Paper>
  );
}

/** Сводка по статусам — только когда статусов больше одного, иначе это шум. */
function StatusSummary({ accounts }: { accounts: TelegramAccount[] }) {
  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: accounts.filter((account) => account.status === status).length,
  })).filter((entry) => entry.count > 0);

  if (counts.length < 2) return null;

  return (
    <Box sx={styles.summary}>
      {counts.map(({ status, count }) => (
        <Chip
          key={status}
          size="small"
          variant="outlined"
          color={ACCOUNT_STATUS_META[status].color}
          label={`${ACCOUNT_STATUS_META[status].label}: ${count}`}
        />
      ))}
    </Box>
  );
}
