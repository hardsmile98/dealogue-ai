import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined'
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined'
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined'
import type { AlertType } from '@/shared/api'
import { ALERT_TYPE_META } from '../lib/alertMeta'

const ICONS: Record<AlertType, ChipProps['icon']> = {
  ready_to_pay: <PaidOutlinedIcon />,
  needs_human: <SupportAgentOutlinedIcon />,
  ai_error: <ErrorOutlinedIcon />,
}

interface AlertTypeChipProps {
  type: AlertType
  size?: ChipProps['size']
  variant?: ChipProps['variant']
}

export function AlertTypeChip({ type, size = 'small', variant = 'filled' }: AlertTypeChipProps) {
  const meta = ALERT_TYPE_META[type]
  return (
    <Chip
      size={size}
      variant={variant}
      color={meta.color}
      icon={ICONS[type]}
      label={meta.label}
      title={meta.description}
      sx={{ fontWeight: 600 }}
    />
  )
}
