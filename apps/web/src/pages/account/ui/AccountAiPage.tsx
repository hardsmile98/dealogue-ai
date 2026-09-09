import { useParams, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { AiSettingsForm } from '@/features/ai-agent/edit-settings'
import { LearningPanel } from '@/features/ai-agent/learning'
import { TestGeneratePanel } from '@/features/ai-agent/test-generate'

type AiTab = 'learning' | 'settings' | 'sandbox'

const TABS: { key: AiTab; label: string }[] = [
  { key: 'learning', label: 'Обучение' },
  { key: 'settings', label: 'Скрипт и настройки' },
  { key: 'sandbox', label: 'Песочница' },
]

/** Вкладка «ИИ-агент» аккаунта; подвкладка живёт в ?tab=, чтобы ссылку можно было сохранить. */
export function AccountAiPage() {
  const { accountId = '' } = useParams<{ accountId: string }>()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: AiTab = TABS.some((t) => t.key === raw) ? (raw as AiTab) : 'learning'

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, next: AiTab) => setParams({ tab: next }, { replace: true })}
        sx={{ mb: 3 }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>
      {tab === 'learning' && <LearningPanel accountId={accountId} />}
      {tab === 'settings' && <AiSettingsForm accountId={accountId} />}
      {tab === 'sandbox' && <TestGeneratePanel accountId={accountId} />}
    </Box>
  )
}
