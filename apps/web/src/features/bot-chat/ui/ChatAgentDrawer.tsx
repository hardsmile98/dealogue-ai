import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import { CHAT_LABEL_LABELS, HANDOFF_REASON_LABELS, STAGE_LABELS } from '@/shared/api'
import { formatDateTime, getApiErrorMessage } from '@/shared/lib'
import { ConfirmAction, QueryBoundary } from '@/shared/ui'
import { JobsView, MODE_LABELS, MemoryView, TurnCard, useGetChatBotStateQuery, useGetChatJournalQuery } from '@/entities/bot'
import { useSetChatModeMutation } from '../api/botChatApi'

type DrawerTab = 'journal' | 'memory' | 'jobs'

const styles = {
  paper: { width: { xs: '100%', sm: 440 }, display: 'flex', flexDirection: 'column' },
  header: { px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' },
  body: { p: 2, overflowY: 'auto', flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1.5 },
  meta: { display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center', mt: 1 },
} as const

interface ChatAgentDrawerProps {
  accountId: string
  chatId: string
  open: boolean
  /** Ход, который раскрыть сразу — по клику на сообщение агента. */
  focusTurnId: string | null
  onClose: () => void
}

/**
 * Панель агента в чате: чей чат и почему, включить или выключить агента,
 * журнал ходов (что понял, что решил, что поправили), память о клиенте и
 * запланированные ступени лестницы молчания.
 */
export function ChatAgentDrawer({ accountId, chatId, open, focusTurnId, onClose }: ChatAgentDrawerProps) {
  const args = { accountId, chatId }
  const stateQuery = useGetChatBotStateQuery(args, { skip: !open })
  const journal = useGetChatJournalQuery(args, { skip: !open })
  const [setMode, modeState] = useSetChatModeMutation()
  const [tab, setTab] = useState<DrawerTab>('journal')
  const state = stateQuery.data?.state ?? null

  // Открыли по сообщению агента — к его ходу.
  useEffect(() => {
    if (!open || !focusTurnId || !journal.data?.journal) return
    document.getElementById(`turn-${focusTurnId}`)?.scrollIntoView({ block: 'start' })
  }, [open, focusTurnId, journal.data])

  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: styles.paper } }}>
      <Box sx={styles.header}>
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>Агент в чате</Typography>
          <IconButton size="small" aria-label="Закрыть" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Box sx={styles.meta}>
          {state ? (
            <>
              <Chip size="small" color={state.mode === 'auto' ? 'success' : 'warning'} label={MODE_LABELS[state.mode]} />
              <Chip size="small" variant="outlined" label={STAGE_LABELS[state.stage]} />
              {state.label && <Chip size="small" color="warning" variant="outlined" label={CHAT_LABEL_LABELS[state.label]} />}
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Агент этот чат не вёл.
            </Typography>
          )}
        </Box>
        {state?.handoffReason && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            {HANDOFF_REASON_LABELS[state.handoffReason]}
            {state.handoffAt ? ` · ${formatDateTime(state.handoffAt)}` : ''}
          </Typography>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          {state?.mode === 'auto' ? (
            <Button size="small" variant="outlined" disabled={modeState.isLoading} onClick={() => void setMode({ ...args, mode: 'off' })}>
              Выключить агента в этом чате
            </Button>
          ) : (
            <ConfirmAction
              question={state?.mode === 'manager' ? 'Вернуть чат агенту?' : 'Передать чат агенту?'}
              description="Агент начнёт отвечать клиенту в Telegram от имени аккаунта: на следующее его сообщение и по лестнице молчания."
              confirmLabel="Передать агенту"
              onConfirm={() => void setMode({ ...args, mode: 'auto' })}
            >
              {(ask) => (
                <Button size="small" variant="contained" disabled={modeState.isLoading} onClick={ask}>
                  {state?.mode === 'manager' ? 'Вернуть агенту' : 'Передать агенту'}
                </Button>
              )}
            </ConfirmAction>
          )}
        </Stack>
        {modeState.error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {getApiErrorMessage(modeState.error, 'Не удалось сменить режим')}
          </Alert>
        )}
      </Box>

      <Tabs value={tab} onChange={(_event, value: DrawerTab) => setTab(value)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="journal" label="Журнал" />
        <Tab value="memory" label="Память" />
        <Tab value="jobs" label="Задания" />
      </Tabs>

      <Box sx={styles.body}>
        <QueryBoundary
          query={journal}
          errorText="Не удалось загрузить журнал"
          isEmpty={(response) => response.journal === null}
          empty="Агент в этом чате ещё не работал."
        >
          {({ journal: data }) =>
            data && (
              <>
                {tab === 'journal' &&
                  (data.turns.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Ходов ещё не было.
                    </Typography>
                  ) : (
                    data.turns.map((turn, index) => (
                      <Box key={turn.id} id={`turn-${turn.id}`}>
                        <TurnCard turn={turn} defaultOpen={focusTurnId ? turn.id === focusTurnId : index === 0} />
                      </Box>
                    ))
                  ))}
                {tab === 'memory' && <MemoryView memory={data.memory} />}
                {tab === 'jobs' && <JobsView jobs={data.jobs} />}
              </>
            )
          }
        </QueryBoundary>
      </Box>
    </Drawer>
  )
}
