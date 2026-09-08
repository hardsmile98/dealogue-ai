import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import { ACCOUNT_STATUS_META } from '../lib/statusMeta'
import type { AccountStatus } from '../model/types'

const STATUS_ICONS: Record<AccountStatus, ChipProps['icon']> = {
  connected: <CheckCircleOutlinedIcon />,
  pending: <HourglassEmptyIcon />,
  disconnected: <LinkOffIcon />,
  error: <ErrorOutlinedIcon />,
}

interface AccountStatusChipProps {
  status: AccountStatus
  size?: ChipProps['size']
}

/** Статус аккаунта: иконка + подпись + цвет, чтобы читалось и без цвета. */
export function AccountStatusChip({ status, size = 'small' }: AccountStatusChipProps) {
  const meta = ACCOUNT_STATUS_META[status]
  return (
    <Chip
      size={size}
      variant="outlined"
      color={meta.color}
      icon={STATUS_ICONS[status]}
      label={meta.label}
      title={meta.description}
      sx={{ fontWeight: 600 }}
    />
  )
}
