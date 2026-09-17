import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import { AiSettingsForm } from '@/features/ai-agent/edit-settings'

/**
 * Вкладка «ИИ-агент» аккаунта. Этап 1: только настройки; библиотека,
 * плейбуки, обзор и статистика добавляются следующими этапами.
 */
export function AccountAiPage() {
  const { accountId = '' } = useParams<{ accountId: string }>()
  return (
    <Box>
      <AiSettingsForm accountId={accountId} />
    </Box>
  )
}
