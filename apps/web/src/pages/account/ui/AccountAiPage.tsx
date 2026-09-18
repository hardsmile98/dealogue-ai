import type { ComponentType } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { AiSettingsForm } from '@/features/ai-agent/edit-settings'
import { OverviewPanel } from '@/widgets/agent-overview'
import { SandboxPanel } from '@/widgets/agent-sandbox'
import { StatsPanel } from '@/widgets/agent-stats'
import {
  CategoriesPanel,
  DiagnosticsPanel,
  FactsPanel,
  LibraryToolbar,
  NotesPanel,
  PhrasesPanel,
  PlaybooksPanel,
} from '@/widgets/agent-library'
import { accountPageStyles as styles } from './AccountPage.styles'

interface AiTab {
  key: string
  label: string
  Panel: ComponentType<{ accountId: string }>
  /** Разделы библиотеки делят общую шапку: счётчики, загрузка, копирование. */
  library?: boolean
}

/** Один список: по нему строятся и вкладки, и содержимое — они не разъедутся. */
const TABS: AiTab[] = [
  { key: 'overview', label: 'Обзор', Panel: OverviewPanel },
  { key: 'playbooks', label: 'Плейбуки', Panel: PlaybooksPanel, library: true },
  { key: 'library', label: 'Библиотека', Panel: PhrasesPanel, library: true },
  { key: 'facts', label: 'Факты', Panel: FactsPanel, library: true },
  { key: 'diagnostics', label: 'Диагностики', Panel: DiagnosticsPanel, library: true },
  { key: 'categories', label: 'Категории', Panel: CategoriesPanel, library: true },
  { key: 'notes', label: 'Заметки', Panel: NotesPanel },
  { key: 'sandbox', label: 'Песочница', Panel: SandboxPanel },
  { key: 'stats', label: 'Статистика', Panel: StatsPanel },
  { key: 'settings', label: 'Настройки', Panel: AiSettingsForm },
]

const DEFAULT_TAB = TABS[0]!

/** Вкладка «ИИ-агент» аккаунта; подвкладка живёт в ?tab=, чтобы ссылку можно было сохранить. */
export function AccountAiPage() {
  const { accountId = '' } = useParams<{ accountId: string }>()
  const [params, setParams] = useSearchParams()

  const requested = params.get('tab')
  const active = TABS.find((tab) => tab.key === requested) ?? DEFAULT_TAB
  const { Panel } = active

  return (
    <Box>
      <Tabs
        value={active.key}
        onChange={(_, next: string) => setParams({ tab: next }, { replace: true })}
        sx={styles.aiTabs}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {TABS.map((tab) => (
          <Tab key={tab.key} value={tab.key} label={tab.label} />
        ))}
      </Tabs>
      {active.library && <LibraryToolbar accountId={accountId} />}
      <Panel accountId={accountId} />
    </Box>
  )
}
