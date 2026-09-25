import { Suspense, useState } from 'react';
import {
  Link as RouterLink,
  Outlet,
  useMatch,
  useNavigate,
  useParams,
} from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ROUTES } from '@/shared/config';
import {
  formatRelative,
  getApiErrorMessage,
  isFetchBaseQueryError,
  joinParts,
  useDocumentTitle,
} from '@/shared/lib';
import { EmptyState, PageHeader } from '@/shared/ui';
import {
  AccountAvatar,
  AccountStatusChip,
  formatContacts,
  needsReconnect,
  useGetAccountQuery,
} from '@/entities/telegram-account';
import type { TelegramAccount } from '@/entities/telegram-account';
import { ConnectAccountDialog } from '@/features/telegram-account/connect';
import { ACCOUNT_SECTIONS, findSection } from '../model/accountSections';
import { AccountActionsMenu } from './AccountActionsMenu';
import { accountPageStyles as styles } from './AccountPage.styles';

/** Статус и синхронизация меняются в фоне — опрашиваем. */
const POLLING_INTERVAL_MS = 30_000;

/** Шапка аккаунта и вкладки; содержимое вкладки — во вложенном роуте. */
export function AccountPage() {
  const { accountId = '' } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const sectionMatch = useMatch(ROUTES.accountSection);
  const section = findSection(sectionMatch?.params.section);
  const [reconnectOpen, setReconnectOpen] = useState(false);

  const {
    data: account,
    error,
    refetch,
  } = useGetAccountQuery(accountId, {
    skip: accountId === '',
    pollingInterval: POLLING_INTERVAL_MS,
  });

  useDocumentTitle(
    account ? `${section.label} · ${account.displayName}` : null,
  );

  if (error && !account) {
    // «Не найден» — только на 404: при обрыве сети аккаунт, скорее всего,
    // есть, и честнее предложить повторить.
    const notFound = isFetchBaseQueryError(error) && error.status === 404;
    return (
      <EmptyState
        title={notFound ? 'Аккаунт не найден' : 'Не удалось открыть аккаунт'}
        description={getApiErrorMessage(
          error,
          notFound ? 'Возможно, он был удалён.' : undefined,
        )}
        action={
          <Stack direction="row" spacing={1}>
            {!notFound && (
              <Button variant="contained" onClick={() => void refetch()}>
                Повторить
              </Button>
            )}
            <Button
              component={RouterLink}
              to={ROUTES.accounts}
              variant="outlined"
            >
              К списку аккаунтов
            </Button>
          </Stack>
        }
      />
    );
  }

  return (
    <Box sx={styles.root}>
      <Box component={RouterLink} to={ROUTES.accounts} sx={styles.backLink}>
        <ArrowBackIcon aria-hidden />
        Аккаунты
      </Box>

      {!account ? (
        <HeaderSkeleton />
      ) : (
        <>
          <AccountHeader
            account={account}
            onReconnect={() => setReconnectOpen(true)}
            onRemoved={() => navigate(ROUTES.accounts, { replace: true })}
          />

          <Tabs
            value={section.key}
            sx={styles.tabs}
            aria-label="Разделы аккаунта"
          >
            {ACCOUNT_SECTIONS.map((item) => (
              <Tab
                key={item.key}
                value={item.key}
                component={RouterLink}
                to={item.link(account.id)}
                label={
                  <Box component="span" sx={styles.tabLabel}>
                    {item.icon}
                    {item.label}
                  </Box>
                }
              />
            ))}
          </Tabs>

          {/* Вкладки грузятся своими чанками: пока грузится вкладка, шапка остаётся. */}
          <Suspense fallback={<LinearProgress aria-label="Загружаем раздел" />}>
            <Outlet />
          </Suspense>

          <ConnectAccountDialog
            open={reconnectOpen}
            initialPhone={account.phone}
            onClose={() => setReconnectOpen(false)}
          />
        </>
      )}
    </Box>
  );
}

interface AccountHeaderProps {
  account: TelegramAccount;
  onReconnect: () => void;
  onRemoved: () => void;
}

/** Имя, статус, контакты, время синхронизации и действия с аккаунтом. */
function AccountHeader({
  account,
  onReconnect,
  onRemoved,
}: AccountHeaderProps) {
  return (
    <>
      <PageHeader
        avatar={<AccountAvatar name={account.displayName} size={48} />}
        title={account.displayName}
        badge={<AccountStatusChip status={account.status} />}
        subtitle={joinParts([
          formatContacts(account),
          account.lastSyncAt &&
            `синхронизация ${formatRelative(account.lastSyncAt)}`,
        ])}
        actions={
          <>
            {needsReconnect(account.status) && (
              <Button variant="contained" onClick={onReconnect}>
                Переподключить
              </Button>
            )}
            <AccountActionsMenu account={account} onRemoved={onRemoved} />
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
    </>
  );
}

function HeaderSkeleton() {
  return (
    <Stack direction="row" spacing={2} sx={styles.headerSkeleton}>
      <Skeleton variant="circular" width={48} height={48} />
      <Box sx={styles.headerSkeletonText}>
        <Skeleton width={240} height={36} />
        <Skeleton width={180} />
      </Box>
    </Stack>
  );
}
