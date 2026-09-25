import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import type { TelegramAccount } from '@/entities/telegram-account';
import { RemoveAccountAction } from './RemoveAccountAction';

interface RemoveAccountButtonProps {
  account: TelegramAccount;
  onRemoved?: () => void;
}

/** Иконка удаления в строке таблицы аккаунтов. */
export function RemoveAccountButton({
  account,
  onRemoved,
}: RemoveAccountButtonProps) {
  return (
    <RemoveAccountAction account={account} onRemoved={onRemoved}>
      {(ask) => (
        <Tooltip title="Удалить аккаунт">
          <IconButton
            size="small"
            aria-label={`Удалить аккаунт ${account.displayName}`}
            onClick={(event) => {
              event.stopPropagation();
              ask();
            }}
          >
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </RemoveAccountAction>
  );
}
