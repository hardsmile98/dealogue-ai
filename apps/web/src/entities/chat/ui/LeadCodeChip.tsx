import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import TagIcon from '@mui/icons-material/Tag'

interface LeadCodeChipProps {
  code: string | null
  size?: ChipProps['size']
  /** Показывать ли «Без кода» вместо пустоты. */
  showEmpty?: boolean
}

/** Код из первого сообщения клиента: «Код 5». */
export function LeadCodeChip({ code, size = 'small', showEmpty = false }: LeadCodeChipProps) {
  if (code === null) {
    if (!showEmpty) return null
    return <Chip size={size} variant="outlined" label="Без кода" sx={{ color: 'text.secondary' }} />
  }
  return (
    <Chip
      size={size}
      color="primary"
      variant="outlined"
      icon={<TagIcon />}
      label={`Код ${code}`}
      sx={{ fontWeight: 600 }}
    />
  )
}
