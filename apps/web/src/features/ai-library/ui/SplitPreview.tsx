import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { usePreviewSplitMutation } from '@/entities/ai-library'

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
    <Box sx={{ mt: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Разбиение на сообщения{isLoading ? '…' : ''}
        </Typography>
        {data && <Chip size="small" variant="outlined" label={`${data.messages.length} сообщ.`} />}
        <Typography variant="caption" color="text.secondary">
          Разделитель — строка «---»; без него текст режется по абзацам до ~1800 символов.
        </Typography>
      </Stack>
      {data && (
        <Stack spacing={0.75} sx={{ maxHeight: 260, overflowY: 'auto' }}>
          {data.messages.map((message, index) => (
            <Box
              key={index}
              sx={{
                p: 1,
                borderRadius: 2,
                bgcolor: '#e0e7ff',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.25 }}>
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
