import { useDispatch } from 'react-redux'
import Button from '@mui/material/Button'
import LogoutIcon from '@mui/icons-material/Logout'
import { sessionCleared } from '@/entities/session'
import { baseApi } from '@/shared/api'

/** Сбрасывает сессию и кеш RTK Query, чтобы данные не утекли следующему пользователю. */
export function LogoutButton() {
  const dispatch = useDispatch()

  const handleLogout = () => {
    dispatch(sessionCleared())
    dispatch(baseApi.util.resetApiState())
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
