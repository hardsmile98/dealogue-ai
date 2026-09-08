import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import TelegramIcon from '@mui/icons-material/Telegram'
import { IS_MOCK_TELEGRAM, accountLinks } from '@/shared/config'
import { getApiErrorMessage, pluralize } from '@/shared/lib'
import { EmptyState, PageHeader } from '@/shared/ui'
import { ACCOUNT_STATUS_META, useGetAccountsQuery } from '@/entities/telegram-account'
import type { AccountStatus, TelegramAccount } from '@/entities/telegram-account'
import { ConnectAccountDialog } from '@/features/telegram-account/connect'
import { AccountsTable } from './AccountsTable'
import { accountsPageStyles as styles } from './AccountsPage.styles'

interface DialogState {
  open: boolean
  initialPhone: string
}

const STATUS_ORDER: AccountStatus[] = ['connected', 'pending', 'disconnected', 'error']

/** Список подключённых аккаунтов Telegram — первый экран после входа. */
export function AccountsPage() {
  const navigate = useNavigate()
  const { data: accounts, isLoading, error } = useGetAccountsQuery()
  const [dialog, setDialog] = useState<DialogState>({ open: false, initialPhone: '' })

  const openConnect = (initialPhone = '') => setDialog({ open: true, initialPhone })
  const closeConnect = () => setDialog((state) => ({ ...state, open: false }))

  const countsByStatus = STATUS_ORDER.map((status) => ({
    status,
    count: accounts?.filter((account) => account.status === status).length ?? 0,
  })).filter((entry) => entry.count > 0)

  const isEmpty = !isLoading && !error && accounts?.length === 0

  return (
    <Box>
      <PageHeader
        title="Аккаунты Telegram"
        subtitle={
          accounts
            ? `${pluralize(accounts.length, ['аккаунт', 'аккаунта', 'аккаунтов'])} под наблюдением`
            : 'Подключённые аккаунты и их состояние'
        }
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openConnect()}>
            Подключить аккаунт
          </Button>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getApiErrorMessage(error, 'Не удалось загрузить аккаунты')}
        </Alert>
      )}

      {countsByStatus.length > 1 && (
        <Box sx={styles.summary}>
          {countsByStatus.map(({ status, count }) => (
            <Chip
              key={status}
              size="small"
              variant="outlined"
              color={ACCOUNT_STATUS_META[status].color}
              label={`${ACCOUNT_STATUS_META[status].label}: ${count}`}
            />
          ))}
        </Box>
      )}

      <Paper elevation={0} sx={styles.tableCard}>
        {isEmpty ? (
          <EmptyState
            icon={<TelegramIcon />}
            title="Пока ни одного аккаунта"
            description="Подключите аккаунт Telegram — мы начнём собирать входящие сообщения и считать, с какими кодами приходят клиенты."
            action={
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => openConnect()}>
                Подключить аккаунт
              </Button>
            }
          />
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <AccountsTable
              accounts={accounts}
              isLoading={isLoading}
              onReconnect={(account: TelegramAccount) => openConnect(account.phone)}
            />
          </Box>
        )}
      </Paper>

      {IS_MOCK_TELEGRAM && (
        <Typography sx={styles.mockNote}>
          Демо-режим: данные сгенерированы локально. Для подключения подойдёт любой номер
          и любой пятизначный код, кроме 00000; номер, оканчивающийся на 0, запросит
          облачный пароль.
        </Typography>
      )}

      <ConnectAccountDialog
        open={dialog.open}
        initialPhone={dialog.initialPhone}
        onClose={closeConnect}
        onOpenAccount={(account) => {
          closeConnect()
          navigate(accountLinks.root(account.id))
        }}
      />
    </Box>
  )
}
