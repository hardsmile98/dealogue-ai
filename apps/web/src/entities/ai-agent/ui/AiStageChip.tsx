import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined'
import type { StageDto } from '@/shared/api'

interface AiStageChipProps {
  stageKey: string | null
  stages?: StageDto[]
  size?: ChipProps['size']
}

/** Этап воронки, на котором, по мнению ИИ, находится клиент. */
export function AiStageChip({ stageKey, stages, size = 'small' }: AiStageChipProps) {
  if (!stageKey) return null
  const name = stages?.find((s) => s.key === stageKey)?.name ?? stageKey
  return (
    <Chip
      size={size}
      variant="outlined"
      icon={<RouteOutlinedIcon />}
      label={name}
      title={`Этап воронки: ${name}`}
      sx={{ color: 'text.secondary' }}
    />
  )
}
