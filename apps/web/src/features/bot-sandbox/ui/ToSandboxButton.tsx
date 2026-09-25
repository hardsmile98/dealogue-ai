import { useNavigate } from 'react-router-dom'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined'
import { accountLinks } from '@/shared/config'
import { getApiErrorMessage } from '@/shared/lib'
import { useSandboxFromChatMutation } from '../api/sandboxApi'

interface ToSandboxButtonProps {
  accountId: string
  chatId: string
  /** telegram_message_id: копия до этого сообщения включительно; без него — весь чат. */
  messageId?: number
  /** Иконка у сообщения вместо кнопки в шапке. */
  compact?: boolean
}

/**
 * «Продолжить в песочнице»: переписка копируется, агент продолжает с того же
 * места, в реальный чат ничего не уходит.
 */
export function ToSandboxButton({ accountId, chatId, messageId, compact = false }: ToSandboxButtonProps) {
  const navigate = useNavigate()
  const [copy, { isLoading, error }] = useSandboxFromChatMutation()

  const run = async () => {
    const session = await copy({ accountId, chatId, messageId }).unwrap().catch(() => null)
    if (session) navigate(accountLinks.sandbox(accountId, session.id))
  }

  const hint = error
    ? getApiErrorMessage(error, 'Не удалось скопировать')
    : compact
      ? 'Продолжить в песочнице с этого сообщения'
      : 'Скопировать переписку в песочницу и посмотреть, как агент продолжит диалог. В чат ничего не уйдёт.'

  return (
    <Tooltip title={hint}>
      {compact ? (
        <IconButton size="small" aria-label="Продолжить в песочнице" disabled={isLoading} onClick={() => void run()} sx={{ p: 0.25 }}>
          <ScienceOutlinedIcon sx={{ fontSize: 14 }} />
        </IconButton>
      ) : (
        <Button size="small" variant="outlined" color={error ? 'error' : 'primary'} startIcon={<ScienceOutlinedIcon />} disabled={isLoading} onClick={() => void run()}>
          В песочницу
        </Button>
      )}
    </Tooltip>
  )
}
