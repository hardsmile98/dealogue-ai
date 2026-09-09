import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import { accountLinks } from '@/shared/config'
import { formatDateTime, getApiErrorMessage } from '@/shared/lib'
import type { ChatDto } from '@/shared/api'
import {
  AI_PAUSED_REASON_META,
  useGetAiSettingsQuery,
  useSetChatAiMutation,
  useStopFollowupsMutation,
} from '@/entities/ai-agent'

interface ChatAiSwitchProps {
  chat: ChatDto
}

/**
 * Переключатель «ИИ отвечает в этом чате» с подписью, почему он остановлен,
 * и планом дожимов. Если ИИ выключен на аккаунте — переключатель заблокирован.
 */
export function ChatAiSwitch({ chat }: ChatAiSwitchProps) {
  const { data: settings } = useGetAiSettingsQuery(chat.accountId)
  const [setChatAi, { isLoading: toggling }] = useSetChatAiMutation()
  const [stopFollowups, { isLoading: stopping }] = useStopFollowupsMutation()
  const [error, setError] = useState<string | null>(null)

  const accountEnabled = settings?.enabled ?? false
  const paused = chat.ai.pausedReason ? AI_PAUSED_REASON_META[chat.ai.pausedReason] : null

  const toggle = async (enabled: boolean) => {
    setError(null)
    try {
      await setChatAi({ accountId: chat.accountId, chatId: chat.id, enabled }).unwrap()
    } catch (caught) {
      setError(getApiErrorMessage(caught))
    }
  }

  const control = (
    <FormControlLabel
      sx={{ m: 0, gap: 0.5 }}
      control={
        <Switch
          size="small"
          color="primary"
          checked={chat.ai.enabled && !chat.ai.pausedReason}
          disabled={!accountEnabled || toggling}
          onChange={(event) => void toggle(event.target.checked)}
          slotProps={{ input: { 'aria-label': 'ИИ отвечает в этом чате' } }}
        />
      }
      label={
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600 }}>
          ИИ отвечает
        </Typography>
      }
    />
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25 }}>
      {accountEnabled ? (
        control
      ) : (
        <Tooltip
          title={
            <span>
              ИИ выключен для аккаунта. Включите его на вкладке{' '}
              <Box component={RouterLink} to={accountLinks.ai(chat.accountId)} sx={{ color: 'inherit' }}>
                «ИИ-агент»
              </Box>
              .
            </span>
          }
        >
          <span>{control}</span>
        </Tooltip>
      )}

      {paused && (
        <Typography sx={{ fontSize: 12, color: `${paused.color}.main` }} title={paused.description}>
          Остановлен: {paused.label}
        </Typography>
      )}

      {chat.ai.enabled && !chat.ai.pausedReason && chat.ai.followupNextAt && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            Дожим {chat.ai.followupStep + 1}: {formatDateTime(chat.ai.followupNextAt)}
          </Typography>
          <Button
            size="small"
            sx={{ fontSize: 12, minWidth: 0, px: 0.5, py: 0 }}
            loading={stopping}
            onClick={() => void stopFollowups({ accountId: chat.accountId, chatId: chat.id })}
          >
            стоп
          </Button>
        </Box>
      )}

      {error && (
        <Typography sx={{ fontSize: 12, color: 'error.main' }}>{error}</Typography>
      )}
    </Box>
  )
}
