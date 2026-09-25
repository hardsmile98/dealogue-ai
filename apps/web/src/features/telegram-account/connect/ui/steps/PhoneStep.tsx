import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { connectAccountDialogStyles as styles } from '../ConnectAccountDialog.styles';

interface PhoneStepProps {
  phone: string;
  onChange: (phone: string) => void;
  disabled: boolean;
}

export function PhoneStep({ phone, onChange, disabled }: PhoneStepProps) {
  return (
    <>
      <Typography variant="body2" sx={styles.hint}>
        Укажите номер аккаунта, сообщения которого нужно отслеживать. Telegram
        пришлёт код подтверждения в приложение на этом номере.
      </Typography>
      <TextField
        label="Номер телефона"
        placeholder="+7 999 123-45-67"
        value={phone}
        onChange={(event) => onChange(event.target.value)}
        autoFocus
        fullWidth
        disabled={disabled}
        slotProps={{
          htmlInput: { inputMode: 'tel', autoComplete: 'tel', type: 'tel' },
        }}
      />
    </>
  );
}
