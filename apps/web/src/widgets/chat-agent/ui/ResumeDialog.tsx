import { useState } from 'react'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { isMutationSuccess } from '@/shared/lib'
import { FormDialog } from '@/shared/ui'
import { FUNNEL_STAGES } from '@/shared/api'
import type { ChatAiStateDto, FunnelStage } from '@/shared/api'
import { CHAT_MODE_META, FUNNEL_STAGE_META, useResumeChatAiMutation } from '@/entities/ai-agent'

interface ResumeDialogProps {
  open: boolean
  onClose: () => void
  accountId: string
  chatId: string
  current: ChatAiStateDto
}

/** «Вернуть боту»: с какого этапа продолжить и когда сделать следующее касание. */
export function ResumeDialog({ open, onClose, accountId, chatId, current }: ResumeDialogProps) {
  const [resume, { isLoading, error }] = useResumeChatAiMutation()
  const [mode, setMode] = useState<'auto' | 'supervised'>(current.mode === 'auto' ? 'auto' : 'supervised')
  const [stage, setStage] = useState<FunnelStage>(current.stage)
  const [when, setWhen] = useState<'now' | 'interval'>('interval')

  const submit = async () => {
    const result = await resume({ accountId, chatId, body: { mode, stage, when } })
    if (isMutationSuccess(result)) onClose()
  }

  return (
    <FormDialog
      open={open}
      maxWidth="xs"
      title="Вернуть боту"
      onClose={onClose}
      onSubmit={() => void submit()}
      error={error}
      errorText="Не удалось вернуть боту"
      submitting={isLoading}
      submitLabel="Вернуть"
    >
      <TextField
        select
        size="small"
        label="Режим"
        value={mode}
        onChange={(e) => setMode(e.target.value as 'auto' | 'supervised')}
      >
        <MenuItem value="auto">{CHAT_MODE_META.auto.label}</MenuItem>
        <MenuItem value="supervised">{CHAT_MODE_META.supervised.label}</MenuItem>
      </TextField>
      <TextField
        select
        size="small"
        label="Этап"
        value={stage}
        onChange={(e) => setStage(e.target.value as FunnelStage)}
      >
        {FUNNEL_STAGES.map((key) => (
          <MenuItem key={key} value={key}>
            {FUNNEL_STAGE_META[key].label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Следующее касание"
        value={when}
        onChange={(e) => setWhen(e.target.value as 'now' | 'interval')}
      >
        <MenuItem value="interval">по интервалу этапа</MenuItem>
        <MenuItem value="now">сейчас</MenuItem>
      </TextField>
      <Typography variant="caption" color="text.secondary">
        Открытые алерты и черновики по чату закроются. Если есть необработанные сообщения клиента, бот ответит на них.
      </Typography>
    </FormDialog>
  )
}
