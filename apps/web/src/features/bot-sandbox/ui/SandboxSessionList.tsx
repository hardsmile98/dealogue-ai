import { useNavigate } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import { STAGE_LABELS } from '@/shared/api'
import { accountLinks } from '@/shared/config'
import { formatDateTime, getApiErrorMessage } from '@/shared/lib'
import { ConfirmAction } from '@/shared/ui'
import { useCreateSandboxMutation, useDeleteSandboxMutation, useListSandboxesQuery } from '../api/sandboxApi'
import { MODE_LABELS } from '@/entities/bot'
import { sandboxStyles as styles } from './sandbox.styles'

interface SandboxSessionListProps {
  accountId: string
  selectedId: string | null
}

/** Сессии песочницы аккаунта: новая пустая, открыть, удалить. */
export function SandboxSessionList({ accountId, selectedId }: SandboxSessionListProps) {
  const navigate = useNavigate()
  const { data: sessions, isLoading, error } = useListSandboxesQuery(accountId)
  const [create, createState] = useCreateSandboxMutation()
  const [remove] = useDeleteSandboxMutation()

  const createSession = async () => {
    const session = await create({ accountId }).unwrap().catch(() => null)
    if (session) navigate(accountLinks.sandbox(accountId, session.id))
  }

  const removeSession = async (sessionId: string) => {
    await remove({ accountId, sessionId }).unwrap().catch(() => null)
    if (sessionId === selectedId) navigate(accountLinks.sandbox(accountId))
  }

  return (
    <Box sx={styles.list}>
      <Box sx={styles.listHeader}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => void createSession()} disabled={createState.isLoading}>
          Новый диалог
        </Button>
        <Typography sx={styles.hint}>
          Пишите за клиента — агент отвечает как в Telegram, но ничего никуда не уходит. Диалог из реального чата —
          кнопкой «В песочницу» в переписке.
        </Typography>
        {createState.error && <Alert severity="error">{getApiErrorMessage(createState.error, 'Не удалось создать')}</Alert>}
      </Box>

      <Box sx={styles.listItems}>
        {error && <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить песочницу')}</Alert>}
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={52} sx={{ mx: 1.5, mb: 1 }} />)}
        <List dense disablePadding>
          {sessions?.map((session) => (
            <ListItemButton
              key={session.id}
              selected={session.id === selectedId}
              onClick={() => navigate(accountLinks.sandbox(accountId, session.id))}
            >
              <Box sx={styles.listItemText}>
                <Typography sx={styles.listItemTitle}>{session.title}</Typography>
                <Typography sx={styles.listItemMeta}>
                  {STAGE_LABELS[session.stage]} · {session.mode === 'auto' ? `${session.messageCount} сообщ.` : MODE_LABELS[session.mode]}
                </Typography>
                <Typography sx={styles.listItemMeta}>{formatDateTime(session.updatedAt)}</Typography>
              </Box>
              <ConfirmAction
                question="Удалить диалог песочницы?"
                description="Переписка, память и журнал этого диалога удалятся. Реальные чаты это не затрагивает."
                confirmLabel="Удалить"
                destructive
                onConfirm={() => void removeSession(session.id)}
              >
                {(ask) => (
                  <IconButton
                    size="small"
                    aria-label="Удалить диалог"
                    onClick={(event) => {
                      event.stopPropagation()
                      ask()
                    }}
                  >
                    <DeleteOutlinedIcon fontSize="small" />
                  </IconButton>
                )}
              </ConfirmAction>
            </ListItemButton>
          ))}
        </List>
        {sessions?.length === 0 && (
          <Typography sx={[styles.hint, { px: 1.5 }]}>Диалогов пока нет.</Typography>
        )}
      </Box>
    </Box>
  )
}
