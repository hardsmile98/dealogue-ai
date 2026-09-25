import type { ReactNode } from 'react'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import type { SandboxSessionDto } from '@/shared/api'
import { JobsView, MemoryView, TurnCard } from '@/entities/bot'
import { sandboxStyles as styles } from './sandbox.styles'

export type InspectorTab = 'journal' | 'memory' | 'jobs'

const TABS: { value: InspectorTab; label: string; icon: ReactNode }[] = [
  { value: 'journal', label: 'Журнал', icon: <ReceiptLongOutlinedIcon fontSize="small" /> },
  { value: 'memory', label: 'Память', icon: <PsychologyOutlinedIcon fontSize="small" /> },
  { value: 'jobs', label: 'Задания', icon: <EventNoteOutlinedIcon fontSize="small" /> },
]

/** Число при вкладке: сколько ходов в журнале и сколько заданий ещё ждут. */
function tabCount(session: SandboxSessionDto, tab: InspectorTab): number {
  if (tab === 'journal') return session.turns.length
  if (tab === 'jobs') return session.jobs.filter((job) => job.status === 'pending').length
  return 0
}

interface SandboxInspectorProps {
  session: SandboxSessionDto
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  onCollapse: () => void
  /** Узкий экран: панель открыта вместо переписки, а не колонкой справа. */
  stacked: boolean
}

/** Развёрнутая панель: журнал ходов, память о клиенте, задания планировщика. */
export function SandboxInspector({ session, tab, onTabChange, onCollapse, stacked }: SandboxInspectorProps) {
  return (
    <Box sx={[styles.inspector, stacked ? styles.inspectorStacked : styles.inspectorSide]}>
      <Box sx={styles.inspectorBar}>
        <Tabs value={tab} onChange={(_event, value: InspectorTab) => onTabChange(value)} variant="fullWidth" sx={styles.inspectorTabs}>
          {TABS.map((item) => {
            const count = tabCount(session, item.value)
            return <Tab key={item.value} value={item.value} label={count ? `${item.label} (${count})` : item.label} />
          })}
        </Tabs>
        <Tooltip title={stacked ? 'Свернуть — к переписке' : 'Свернуть панель'}>
          <IconButton size="small" aria-label="Свернуть панель" onClick={onCollapse}>
            {stacked ? <ExpandLessIcon /> : <ChevronRightIcon />}
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={styles.inspectorBody}>
        {tab === 'journal' &&
          (session.turns.length === 0 ? (
            <Typography sx={styles.small} color="text.secondary">
              Ходов ещё не было.
            </Typography>
          ) : (
            session.turns.map((turn, index) => <TurnCard key={turn.id} turn={turn} defaultOpen={index === 0} />)
          ))}
        {tab === 'memory' && <MemoryView memory={session.memory} />}
        {tab === 'jobs' && <JobsView jobs={session.jobs} />}
      </Box>
    </Box>
  )
}

interface InspectorRailProps {
  session: SandboxSessionDto
  /** Без вкладки — развернуть на той, что была открыта. */
  onOpen: (tab?: InspectorTab) => void
  /** Колонка справа от переписки; иначе — строка иконок в шапке диалога. */
  vertical: boolean
}

/** Свёрнутая панель: иконки вкладок с числами, клик разворачивает нужную. */
export function InspectorRail({ session, onOpen, vertical }: InspectorRailProps) {
  const placement = vertical ? 'left' : 'bottom'

  return (
    <Box sx={vertical ? styles.rail : styles.railInline}>
      {vertical && (
        <Tooltip title="Развернуть панель" placement={placement}>
          <IconButton size="small" aria-label="Развернуть панель" onClick={() => onOpen()}>
            <ChevronLeftIcon />
          </IconButton>
        </Tooltip>
      )}
      {TABS.map((item) => (
        <Tooltip key={item.value} title={item.label} placement={placement}>
          <IconButton size="small" aria-label={item.label} onClick={() => onOpen(item.value)}>
            <Badge badgeContent={tabCount(session, item.value)} color="primary" max={99} sx={styles.railBadge}>
              {item.icon}
            </Badge>
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  )
}
