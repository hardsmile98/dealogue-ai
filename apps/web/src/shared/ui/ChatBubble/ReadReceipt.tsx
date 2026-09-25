import Box from '@mui/material/Box';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DoneIcon from '@mui/icons-material/Done';
import { formatDateTime } from '@/shared/lib';
import { chatBubbleStyles as styles } from './ChatBubble.styles';

interface ReadReceiptProps {
  /** Когда собеседник прочитал; null — ещё не прочитал. */
  readAt: string | null;
}

/** Галочки у исходящего: одна — доставлено, две цветные — прочитано. */
export function ReadReceipt({ readAt }: ReadReceiptProps) {
  const label = readAt ? `Прочитано ${formatDateTime(readAt)}` : 'Не прочитано';

  return (
    <Box
      component="span"
      role="img"
      aria-label={label}
      title={label}
      sx={[styles.readReceipt, Boolean(readAt) && styles.readReceiptRead]}
    >
      {readAt ? <DoneAllIcon /> : <DoneIcon />}
    </Box>
  );
}
