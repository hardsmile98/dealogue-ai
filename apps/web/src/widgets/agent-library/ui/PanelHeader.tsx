import type { ReactNode } from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { agentLibraryStyles as styles } from './AgentLibrary.styles'

interface PanelHeaderProps {
  /** Зачем нужен раздел и как им пользоваться — одним абзацем. */
  hint: ReactNode
  /** Фильтры и кнопка «Добавить» справа. */
  children?: ReactNode
}

/** Одинаковая шапка у всех разделов библиотеки: пояснение слева, действия справа. */
export function PanelHeader({ hint, children }: PanelHeaderProps) {
  return (
    <Stack direction="row" spacing={1} sx={styles.header}>
      <Typography variant="body2" color="text.secondary" sx={styles.hint}>
        {hint}
      </Typography>
      {children}
    </Stack>
  )
}
