import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { connectAccountDialogStyles as styles } from '../ConnectAccountDialog.styles';

interface PasswordStepProps {
  password: string;
  onChange: (password: string) => void;
  disabled: boolean;
}

export function PasswordStep({
  password,
  onChange,
  disabled,
}: PasswordStepProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Typography variant="body2" sx={styles.hint}>
        В аккаунте включена двухэтапная аутентификация. Введите облачный пароль
        Telegram — мы не сохраняем его, только сессию.
      </Typography>
      <TextField
        label="Облачный пароль"
        type={visible ? 'text' : 'password'}
        value={password}
        onChange={(event) => onChange(event.target.value)}
        autoFocus
        fullWidth
        disabled={disabled}
        slotProps={{
          htmlInput: { autoComplete: 'current-password' },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  onClick={() => setVisible((value) => !value)}
                  disabled={disabled}
                  aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {visible ? (
                    <VisibilityOffIcon fontSize="small" />
                  ) : (
                    <VisibilityIcon fontSize="small" />
                  )}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
    </>
  );
}
