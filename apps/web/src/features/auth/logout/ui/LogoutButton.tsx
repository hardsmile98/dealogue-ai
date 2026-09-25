import { useDispatch } from 'react-redux';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import LogoutIcon from '@mui/icons-material/Logout';
import { sessionCleared } from '@/entities/session';

interface LogoutButtonProps {
  /** icon — компактный вариант для боковой панели. */
  variant?: 'button' | 'icon';
}

/** Завершает сессию: хранилище и кеш RTK Query чистит entities/session. */
export function LogoutButton({ variant = 'button' }: LogoutButtonProps) {
  const dispatch = useDispatch();

  const handleLogout = () => {
    dispatch(sessionCleared());
  };

  if (variant === 'icon') {
    return (
      <Tooltip title="Выйти">
        <IconButton size="small" onClick={handleLogout} aria-label="Выйти">
          <LogoutIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
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
  );
}
