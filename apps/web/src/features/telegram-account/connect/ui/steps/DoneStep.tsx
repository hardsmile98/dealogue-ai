import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { formatPhone } from '@/shared/lib';
import type { TelegramAccount } from '@/entities/telegram-account';
import { connectAccountDialogStyles as styles } from '../ConnectAccountDialog.styles';

export function DoneStep({ account }: { account: TelegramAccount }) {
  return (
    <Stack spacing={1} sx={styles.done}>
      <CheckCircleOutlinedIcon sx={styles.doneIcon} aria-hidden />
      <Typography variant="h6" component="p">
        {account.displayName}
      </Typography>
      <Typography variant="body2" sx={styles.hint}>
        {formatPhone(account.phone)}. Начинаем синхронизацию чатов — первые
        сообщения появятся в статистике через пару минут.
      </Typography>
    </Stack>
  );
}
