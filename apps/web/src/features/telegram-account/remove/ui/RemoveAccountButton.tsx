import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import { formatPhone, getApiErrorMessage } from '@/shared/lib'
import type { TelegramAccount } from '@/entities/telegram-account'
import { useRemoveAccountMutation } from '../api/removeApi'

interface RemoveAccountButtonProps {
  account: TelegramAccount
  /** icon — компактная кнопка в строке таблицы; button — обычная кнопка с текстом. */
  variant?: 'icon' | 'button'
  onRemoved?: () => void
}

/** Удаление аккаунта с подтверждением: завершает сессию Telegram и стирает историю. */
export function RemoveAccountButton({
  account,
  variant = 'icon',
  onRemoved,
}: RemoveAccountButtonProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removeAccount, { isLoading }] = useRemoveAccountMutation()

  const close = () => {
    if (isLoading) return
    setOpen(false)
    setError(null)
  }

  const confirm = async () => {
    setError(null)
    try {
      await removeAccount(account.id).unwrap()
      setOpen(false)
      onRemoved?.()
    } catch (caught) {
      setError(getApiErrorMessage(caught))
    }
  }

  return (
    <>
      {variant === 'icon' ? (
        <Tooltip title="Удалить аккаунт">
          <IconButton
            size="small"
            aria-label={`Удалить аккаунт ${account.displayName}`}
            onClick={(event) => {
              event.stopPropagation()
              setOpen(true)
            }}
          >
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          color="error"
          variant="outlined"
          startIcon={<DeleteOutlinedIcon />}
          onClick={() => setOpen(true)}
        >
          Удалить
        </Button>
      )}

      <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить аккаунт {account.displayName}?</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <DialogContentText>
            Сессия Telegram для номера {formatPhone(account.phone)} будет завершена, а чаты,
            сообщения и статистика по этому аккаунту — удалены из Dealogue.
            В самом Telegram переписка останется.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={close} disabled={isLoading}>
            Отмена
          </Button>
          <Button color="error" variant="contained" onClick={confirm} loading={isLoading}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
