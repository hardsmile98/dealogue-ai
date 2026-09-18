import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { usePreviewSplitMutation } from '@/entities/ai-library'
import { agentLibraryStyles as styles } from './AgentLibrary.styles'

interface SplitPreviewProps {
  accountId: string
  text: string
}

/** Как текст разрежется на сообщения Telegram (по `---` или по абзацам). */
export function SplitPreview({ accountId, text }: SplitPreviewProps) {
  const [preview, { data, isLoading }] = usePreviewSplitMutation()

  useEffect(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    const timer = setTimeout(() => void preview({ accountId, text: trimmed }), 400)
    return () => clearTimeout(timer)
  }, [accountId, text, preview])

  if (!text.trim()) return null

  return (
    <Box sx={styles.splitPreview}>
      <Stack direction="row" spacing={1} sx={styles.splitHeader}>
        <Typography variant="caption" color="text.secondary">
          Разбиение на сообщения{isLoading ? '…' : ''}
        </Typography>
        {data && <Chip size="small" variant="outlined" label={`${data.messages.length} сообщ.`} />}
        <Typography variant="caption" color="text.secondary">
          Разделитель — строка «---»; без него текст режется по абзацам до ~1800 символов.
        </Typography>
      </Stack>
      {data && (
        <Stack spacing={0.75} sx={styles.splitList}>
          {data.messages.map((message, index) => (
            <Box key={index} sx={styles.splitMessage}>
              <Typography variant="caption" sx={styles.splitMessageMeta}>
                #{index + 1} · {data.lengths[index]} симв.
              </Typography>
              {message.length > 400 ? `${message.slice(0, 400)}…` : message}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  )
}
