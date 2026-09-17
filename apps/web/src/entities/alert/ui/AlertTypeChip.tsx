import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined'
import ChildCareOutlinedIcon from '@mui/icons-material/ChildCareOutlined'
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined'
import HourglassBottomOutlinedIcon from '@mui/icons-material/HourglassBottomOutlined'
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined'
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined'
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined'
import type { AlertType } from '@/shared/api'
import { ALERT_TYPE_META } from '../lib/alertMeta'

const ICONS: Record<AlertType, ChipProps['icon']> = {
  handoff: <SupportAgentOutlinedIcon />,
  minor: <ChildCareOutlinedIcon />,
  media: <AttachFileOutlinedIcon />,
  stale_lead: <HourglassBottomOutlinedIcon />,
  library_incomplete: <LibraryBooksOutlinedIcon />,
  ai_error: <ErrorOutlinedIcon />,
  anomaly: <WarningAmberOutlinedIcon />,
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
