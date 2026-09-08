import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { SxStyles } from '@/shared/types'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Строка над заголовком: хлебные крошки, ссылка «назад». */
  eyebrow?: ReactNode
  /** Кнопки справа. */
  actions?: ReactNode
}

const styles = {
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 2,
    mb: 3,
  },
  title: {
    fontSize: { xs: 24, md: 28 },
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  subtitle: {
    color: 'text.secondary',
    mt: 0.5,
  },
  actions: {
    flexShrink: 0,
  },
} satisfies SxStyles

export function PageHeader({ title, subtitle, eyebrow, actions }: PageHeaderProps) {
  return (
    <Box sx={styles.root}>
      <Box>
        {eyebrow}
        <Typography component="h1" sx={styles.title}>
          {title}
        </Typography>
        {subtitle && (
          <Typography component="div" variant="body2" sx={styles.subtitle}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} sx={styles.actions}>
          {actions}
        </Stack>
      )}
    </Box>
  )
}
