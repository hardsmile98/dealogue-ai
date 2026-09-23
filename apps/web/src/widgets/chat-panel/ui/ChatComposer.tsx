import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SendIcon from '@mui/icons-material/Send'
import { getApiErrorMessage, isMutationSuccess } from '@/shared/lib'
import { useSendMessageMutation } from '@/entities/chat'
import { chatThreadStyles as styles } from './ChatThread.styles'

interface ChatComposerProps {
  accountId: string
  chatId: string
}

/** Ответ клиенту от имени аккаунта; Ctrl/⌘+Enter — отправить. */
export function ChatComposer({ accountId, chatId }: ChatComposerProps) {
  const [text, setText] = useState('')
  const [sendMessage, { isLoading: sending, error }] = useSendMessageMutation()
  const canSend = text.trim() !== '' && !sending

  const submit = async () => {
    if (!canSend) return
    const result = await sendMessage({ accountId, chatId, text: text.trim() })
    if (isMutationSuccess(result)) setText('')
  }

  return (
    <Box sx={styles.composer}>
      {error && (
        <Alert severity="error" sx={styles.composerError}>
          {getApiErrorMessage(error, 'Не удалось отправить сообщение')}
        </Alert>
      )}
      <Box sx={styles.composerRow}>
        <TextField
          fullWidth
          multiline
          maxRows={6}
          size="small"
          placeholder="Написать клиенту от имени аккаунта… (Ctrl+Enter — отправить)"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <IconButton color="primary" aria-label="Отправить" disabled={!canSend} onClick={() => void submit()}>
          <SendIcon />
        </IconButton>
      </Box>
      <Typography sx={styles.composerHint}>Сообщение уйдёт в Telegram от имени аккаунта.</Typography>
    </Box>
  )
}
