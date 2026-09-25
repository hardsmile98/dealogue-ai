import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { formatPhone } from '@/shared/lib';
import { MAX_CODE_LENGTH } from '../../model/useConnectFlow';
import { connectAccountDialogStyles as styles } from '../ConnectAccountDialog.styles';

interface CodeStepProps {
  phone: string;
  code: string;
  onChange: (code: string) => void;
  onChangePhone: () => void;
  disabled: boolean;
}

export function CodeStep({
  phone,
  code,
  onChange,
  onChangePhone,
  disabled,
}: CodeStepProps) {
  return (
    <>
      <Typography variant="body2" sx={styles.hint}>
        Код отправлен в Telegram на номер{' '}
        <Box component="span" sx={styles.phoneEcho}>
          {formatPhone(phone)}
        </Box>
        . Введите его — обычно это 5 цифр.
      </Typography>
      <TextField
        label="Код подтверждения"
        value={code}
        onChange={(event) => onChange(event.target.value)}
        autoFocus
        fullWidth
        disabled={disabled}
        slotProps={{
          htmlInput: {
            inputMode: 'numeric',
            autoComplete: 'one-time-code',
            maxLength: MAX_CODE_LENGTH,
          },
        }}
      />
      <Button
        size="small"
        onClick={onChangePhone}
        disabled={disabled}
        sx={styles.changePhone}
      >
        Изменить номер
      </Button>
    </>
  );
}
