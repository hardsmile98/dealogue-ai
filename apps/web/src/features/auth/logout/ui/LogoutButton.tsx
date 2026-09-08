import { useDispatch } from 'react-redux'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import LogoutIcon from '@mui/icons-material/Logout'
import { sessionCleared } from '@/entities/session'
import { baseApi } from '@/shared/api'

interface LogoutButtonProps {
  /** icon — компактный вариант для боковой панели. */
  variant?: 'button' | 'icon'
}

/** Сбрасывает сессию и кеш RTK Query, чтобы данные не утекли следующему пользователю. */
export function LogoutButton({ variant = 'button' }: LogoutButtonProps) {
  const dispatch = useDispatch()

  const handleLogout = () => {
    dispatch(sessionCleared())
    dispatch(baseApi.util.resetApiState())
  }

  if (variant === 'icon') {
    return (
      <Tooltip title="Выйти">
        <IconButton size="small" onClick={handleLogout} aria-label="Выйти">
          <LogoutIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    )
  }

  return (
    <Button
      variant="outlined"
      color="inherit"
      startIcon={<LogoutIcon />}
      onClick={handleLogout}
    >
      Выйти
    </Button>
  )
}
