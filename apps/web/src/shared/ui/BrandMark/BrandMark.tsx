import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { brandMarkStyles } from './BrandMark.styles'

interface BrandMarkProps {
  /** Точечные переопределения поверх базового стиля (см. паттерн sx-мерджа в MUI). */
  sx?: SxProps<Theme>
}

/** Квадратный логотип-плашка Dealogue AI. */
export function BrandMark({ sx }: BrandMarkProps) {
  return (
    <Box sx={[brandMarkStyles.root, ...(Array.isArray(sx) ? sx : [sx])]}>
      <AutoAwesomeIcon fontSize="small" />
    </Box>
  )
}
