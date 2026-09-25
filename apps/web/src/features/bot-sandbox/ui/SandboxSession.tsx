import { useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ScheduleIcon from '@mui/icons-material/Schedule'
import { HANDOFF_REASON_LABELS, STAGE_LABELS } from '@/shared/api'
import { formatDateTime, useStoredState } from '@/shared/lib'
import { QueryBoundary } from '@/shared/ui'
import { sandboxApi, useGetSandboxQuery } from '../api/sandboxApi'
import { MODE_LABELS } from '@/entities/bot'
import { SandboxComposer } from './SandboxComposer'
import { SandboxFeed } from './SandboxFeed'
import { InspectorRail, SandboxInspector } from './SandboxInspector'
import type { InspectorTab } from './SandboxInspector'
import { sandboxStyles as styles } from './sandbox.styles'

/** Пока агент отвечает, сессия опрашивается — ход идёт на сервере в фоне. */
const RUNNING_POLL_MS = 1_000

interface SandboxSessionProps {
  accountId: string
  sessionId: string
  /** Узкий экран: стрелка назад к списку диалогов. */
  onBack?: () => void
}

/**
 * Открытая сессия: диалог с часами, справа журнал и память. Панель
 * сворачивается в столбик иконок; на узком экране она свёрнута в шапку
 * диалога и открывается вместо переписки.
 */
export function SandboxSession({ accountId, sessionId, onBack }: SandboxSessionProps) {
  const args = { accountId, sessionId }
  // Чтение кэша без подписки — чтобы решить, опрашивать ли сессию.
  const cached = sandboxApi.endpoints.getSandbox.useQueryState(args)
  const query = useGetSandboxQuery(args, { pollingInterval: cached.data?.running ? RUNNING_POLL_MS : 0 })

  const theme = useTheme()
  const stacked = useMediaQuery(theme.breakpoints.down('lg'), { noSsr: true })
  const [tab, setTab] = useState<InspectorTab>('journal')
  // Колонка справа — настройка вида, её помним между диалогами; на узком
  // экране панель закрывает переписку и при каждом открытии диалога свёрнута.
  const [sideOpen, setSideOpen] = useStoredState('sandbox.inspectorOpen', true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const open = stacked ? sheetOpen : sideOpen
  const setOpen = stacked ? setSheetOpen : setSideOpen

  const openInspector = (next?: InspectorTab) => {
    if (next) setTab(next)
    setOpen(true)
  }

  return (
    <QueryBoundary query={query} errorText="Не удалось открыть диалог песочницы" skeleton={400} isEmpty={() => false}>
      {(session) => {
        const inspector = (
          <SandboxInspector session={session} tab={tab} onTabChange={setTab} onCollapse={() => setOpen(false)} stacked={stacked} />
        )
        const sheet = stacked && open

        return (
          <Box sx={styles.session}>
            <Box sx={styles.dialog}>
              <Box sx={styles.dialogHeader}>
                {onBack && (
                  <IconButton size="small" onClick={onBack} aria-label="К списку диалогов" sx={styles.backButton}>
                    <ArrowBackIcon fontSize="small" />
                  </IconButton>
                )}
                <Box sx={styles.dialogHeaderText}>
                  <Typography sx={styles.dialogTitle}>{session.title}</Typography>
                  <Box sx={styles.chips}>
                    <Chip size="small" color="primary" variant="outlined" label={STAGE_LABELS[session.stage]} />
                    <Chip size="small" color={session.mode === 'auto' ? 'success' : 'warning'} label={MODE_LABELS[session.mode]} />
                    {session.handoffReason && <span>{HANDOFF_REASON_LABELS[session.handoffReason]}</span>}
                    <Box component="span" sx={styles.clock} title="Виртуальное время песочницы">
                      <ScheduleIcon />
                      {formatDateTime(session.virtualNow)}
                    </Box>
                  </Box>
                </Box>
                {stacked && !open && <InspectorRail session={session} onOpen={openInspector} vertical={false} />}
              </Box>
              {session.running && <LinearProgress />}
              {sheet && inspector}
              {/* Под панелью поле ввода только прячется — набранный текст не теряется;
                  ленту же монтируем заново, чтобы она открылась на последнем сообщении. */}
              <Box sx={[styles.chat, sheet && styles.hidden]}>
                {!sheet && <SandboxFeed messages={session.messages} />}
                <SandboxComposer session={session} />
              </Box>
            </Box>
            {!stacked && (open ? inspector : <InspectorRail session={session} onOpen={openInspector} vertical />)}
          </Box>
        )
      }}
    </QueryBoundary>
  )
}
