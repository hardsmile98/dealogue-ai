import { useState } from 'react'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { isMutationSuccess } from '@/shared/lib'
import { FormDialog } from '@/shared/ui'
import type { ChatAiStateDto, Gender } from '@/shared/api'
import { usePatchChatAiMutation } from '@/entities/ai-agent'
import { useGetCategoriesQuery } from '@/entities/ai-library'

interface SlotsDialogProps {
  open: boolean
  onClose: () => void
  accountId: string
  chatId: string
  current: ChatAiStateDto
}

/** Правка того, что бот понял о клиенте: дата и место рождения, пол, запрос. */
export function SlotsDialog({ open, onClose, accountId, chatId, current }: SlotsDialogProps) {
  const [patch, { isLoading, error }] = usePatchChatAiMutation()
  const { data: categories } = useGetCategoriesQuery({ accountId })
  const slots = current.slots
  const [birthDate, setBirthDate] = useState(slots.birthDate ?? '')
  const [birthPlace, setBirthPlace] = useState(slots.birthPlace ?? '')
  const [gender, setGender] = useState<Gender | ''>(slots.gender ?? '')
  const [language, setLanguage] = useState(slots.language)
  const [requestSummary, setRequestSummary] = useState(slots.requestSummary ?? '')
  const [requestCategoryKey, setRequestCategoryKey] = useState(slots.requestCategoryKey ?? '')
  const [manualNotes, setManualNotes] = useState(current.manualNotes ?? '')

  const submit = async () => {
    const result = await patch({
      accountId,
      chatId,
      patch: {
        slots: {
          birthDate: birthDate.trim() || null,
          birthPlace: birthPlace.trim() || null,
          gender: gender || null,
          language: language.trim() || 'ru',
          requestSummary: requestSummary.trim() || null,
          requestCategoryKey: requestCategoryKey || null,
        },
        manualNotes: manualNotes.trim() || null,
      },
    })
    if (isMutationSuccess(result)) onClose()
  }

  return (
    <FormDialog
      open={open}
      title="Данные клиента"
      onClose={onClose}
      onSubmit={() => void submit()}
      error={error}
      submitting={isLoading}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          size="small"
          fullWidth
          label="Дата рождения (ГГГГ-ММ-ДД)"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        <TextField
          size="small"
          fullWidth
          label="Место рождения"
          value={birthPlace}
          onChange={(e) => setBirthPlace(e.target.value)}
        />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          size="small"
          fullWidth
          label="Пол"
          value={gender}
          onChange={(e) => setGender(e.target.value as Gender | '')}
        >
          <MenuItem value="">не известен</MenuItem>
          <MenuItem value="f">женский</MenuItem>
          <MenuItem value="m">мужской</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          fullWidth
          label="Язык"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <MenuItem value="ru">русский</MenuItem>
          <MenuItem value="en">английский</MenuItem>
        </TextField>
      </Stack>
      <TextField
        size="small"
        fullWidth
        multiline
        minRows={2}
        label="Запрос клиента"
        value={requestSummary}
        onChange={(e) => setRequestSummary(e.target.value)}
      />
      <TextField
        select
        size="small"
        fullWidth
        label="Категория"
        value={requestCategoryKey}
        onChange={(e) => setRequestCategoryKey(e.target.value)}
      >
        <MenuItem value="">не выбрана</MenuItem>
        {(categories ?? []).map((category) => (
          <MenuItem key={category.key} value={category.key}>
            {category.title}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        fullWidth
        multiline
        minRows={2}
        label="Заметка по чату (видна только вам)"
        value={manualNotes}
        onChange={(e) => setManualNotes(e.target.value)}
      />
      <Typography variant="caption" color="text.secondary">
        Поля, которые вы поправили, бот больше не перезаписывает.
      </Typography>
    </FormDialog>
  )
}
