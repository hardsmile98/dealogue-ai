import { useState } from 'react'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import { isMutationSuccess } from '@/shared/lib'
import { FormDialog } from '@/shared/ui'
import type { TurnDto } from '@/shared/api'
import { useRateTurnMutation } from '@/entities/ai-agent'
import { chatAgentStyles as styles } from './ChatAgent.styles'

interface RateTurnProps {
  accountId: string
  chatId: string
  turn: Pick<TurnDto, 'id' | 'rating' | 'ratingNote'>
}

/** 👍 / 👎 с комментарием; 👎 предлагает создать заметку для промпта. */
export function RateTurn({ accountId, chatId, turn }: RateTurnProps) {
  const [rate, { isLoading, error }] = useRateTurnMutation()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(turn.ratingNote ?? '')
  const [createNote, setCreateNote] = useState(false)

  /** Повторное нажатие 👍 снимает оценку. */
  const markGood = () =>
    void rate({
      accountId,
      chatId,
      turnId: turn.id,
      body: { rating: turn.rating === 'good' ? null : 'good' },
    })

  const markBad = async () => {
    const result = await rate({
      accountId,
      chatId,
      turnId: turn.id,
      body: { rating: 'bad', note: note.trim() || null, createNote },
    })
    if (isMutationSuccess(result)) setOpen(false)
  }

  return (
    <>
      <Tooltip title="Хороший ход">
        <IconButton size="small" onClick={markGood} disabled={isLoading} sx={styles.rateButton}>
          {turn.rating === 'good' ? (
            <ThumbUpIcon sx={styles.rateIcon} color="success" />
          ) : (
            <ThumbUpOutlinedIcon sx={styles.rateIcon} />
          )}
        </IconButton>
      </Tooltip>
      <Tooltip title="Плохой ход — с комментарием">
        <IconButton size="small" onClick={() => setOpen(true)} disabled={isLoading} sx={styles.rateButton}>
          {turn.rating === 'bad' ? (
            <ThumbDownIcon sx={styles.rateIcon} color="error" />
          ) : (
            <ThumbDownOutlinedIcon sx={styles.rateIcon} />
          )}
        </IconButton>
      </Tooltip>

      <FormDialog
        open={open}
        maxWidth="xs"
        title="Что не так с этим ходом?"
        onClose={() => setOpen(false)}
        onSubmit={() => void markBad()}
        error={error}
        errorText="Не удалось сохранить оценку"
        submitting={isLoading}
        submitLabel="Плохой ход"
      >
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={3}
          autoFocus
          label="Комментарий"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <FormControlLabel
          control={
            <Switch size="small" checked={createNote} onChange={(e) => setCreateNote(e.target.checked)} />
          }
          label="Сохранить как заметку для бота (попадёт в промпт этапа)"
        />
      </FormDialog>
    </>
  )
}
