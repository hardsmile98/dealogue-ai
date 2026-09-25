import { useId, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { TelegramAccount } from '@/entities/telegram-account';
import { RemoveAccountAction } from '@/features/telegram-account/remove';
import { accountPageStyles as styles } from './AccountPage.styles';

interface AccountActionsMenuProps {
  account: TelegramAccount;
  onRemoved: () => void;
}

/**
 * Редкие действия с аккаунтом — в меню «⋯», а не красной кнопкой в шапке:
 * удаление нужно раз в жизни аккаунта, а видно было бы на каждом экране.
 */
export function AccountActionsMenu({
  account,
  onRemoved,
}: AccountActionsMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const close = () => setAnchor(null);

  return (
    <RemoveAccountAction account={account} onRemoved={onRemoved}>
      {(askRemove) => (
        <>
          <Tooltip title="Действия с аккаунтом">
            <IconButton
              aria-label="Действия с аккаунтом"
              aria-haspopup="menu"
              aria-controls={anchor ? menuId : undefined}
              aria-expanded={Boolean(anchor)}
              onClick={(event) => setAnchor(event.currentTarget)}
            >
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
          <Menu
            id={menuId}
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={close}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem
              onClick={() => {
                close();
                askRemove();
              }}
              sx={styles.dangerItem}
            >
              <ListItemIcon>
                <DeleteOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Удалить аккаунт</ListItemText>
            </MenuItem>
          </Menu>
        </>
      )}
    </RemoveAccountAction>
  );
}
