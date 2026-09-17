import { useParams, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { AiSettingsForm } from '@/features/ai-agent/edit-settings'
import {
  CategoriesPanel,
  DiagnosticsPanel,
  FactsPanel,
  LibraryToolbar,
  NotesPanel,
  PhrasesPanel,
  PlaybooksPanel,
} from '@/features/ai-library'

type AiTab = 'playbooks' | 'library' | 'facts' | 'diagnostics' | 'categories' | 'notes' | 'settings'

const TABS: { key: AiTab; label: string }[] = [
  { key: 'playbooks', label: 'Плейбуки' },
  { key: 'library', label: 'Библиотека' },
  { key: 'facts', label: 'Факты' },
  { key: 'diagnostics', label: 'Диагностики' },
  { key: 'categories', label: 'Категории' },
  { key: 'notes', label: 'Заметки' },
  { key: 'settings', label: 'Настройки' },
]

const LIBRARY_TABS: AiTab[] = ['playbooks', 'library', 'facts', 'diagnostics', 'categories']

/** Вкладка «ИИ-агент» аккаунта; подвкладка живёт в ?tab=, чтобы ссылку можно было сохранить. */
export function AccountAiPage() {
  const { accountId = '' } = useParams<{ accountId: string }>()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: AiTab = TABS.some((t) => t.key === raw) ? (raw as AiTab) : 'playbooks'

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, next: AiTab) => setParams({ tab: next }, { replace: true })}
        sx={{ mb: 2.5 }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>
      {LIBRARY_TABS.includes(tab) && <LibraryToolbar accountId={accountId} />}
      {tab === 'playbooks' && <PlaybooksPanel accountId={accountId} />}
      {tab === 'library' && <PhrasesPanel accountId={accountId} />}
      {tab === 'facts' && <FactsPanel accountId={accountId} />}
      {tab === 'diagnostics' && <DiagnosticsPanel accountId={accountId} />}
      {tab === 'categories' && <CategoriesPanel accountId={accountId} />}
      {tab === 'notes' && <NotesPanel accountId={accountId} />}
      {tab === 'settings' && <AiSettingsForm accountId={accountId} />}
    </Box>
  )
}
