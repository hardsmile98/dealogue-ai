import { useState } from 'react'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { isMutationSuccess } from '@/shared/lib'
import { FormDialog } from '@/shared/ui'
import { PHRASE_KINDS } from '@/shared/api'
import type { PhraseKind } from '@/shared/api'
import { PHRASE_KIND_META } from '@/entities/ai-library'
import { useDraftToExampleMutation, useDraftToNoteMutation } from '@/entities/ai-draft'

interface SaveDraftDialogProps {
  /** null — диалог закрыт; иначе что именно сохраняем. */
  mode: 'example' | 'note' | null
  onClose: () => void
  accountId: string
  chatId: string
  draftId: string
  /** Текст готовит вызывающий: у примера — ответ, у заметки — пусто. */
  text: string
  onTextChange: (text: string) => void
}

/** Один диалог на оба сохранения: у примера — вид фразы, у заметки — область действия. */
export function SaveDraftDialog({
  mode,
  onClose,
  accountId,
  chatId,
  draftId,
  text,
  onTextChange,
}: SaveDraftDialogProps) {
  const [toExample, { isLoading: savingExample, error: exampleError }] = useDraftToExampleMutation()
  const [toNote, { isLoading: savingNote, error: noteError }] = useDraftToNoteMutation()
  const [kind, setKind] = useState<PhraseKind>('quick_reply')
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState('global')

  const submit = async () => {
    const body = text.trim()
    if (!body) return
    const result =
      mode === 'example'
        ? await toExample({ accountId, chatId, draftId, body: { kind, title: title.trim(), text: body } })
        : await toNote({ accountId, chatId, draftId, body: { text: body, scope } })
    if (isMutationSuccess(result)) {
      setTitle('')
      onClose()
    }
  }

  return (
    <FormDialog
      open={mode !== null}
      title={mode === 'example' ? 'Сохранить как образец' : 'Сохранить как заметку'}
      onClose={onClose}
      onSubmit={() => void submit()}
      error={exampleError ?? noteError}
      submitting={savingExample || savingNote}
      submitDisabled={!text.trim()}
    >
      {mode === 'example' ? (
        <>
          <TextField
            select
            size="small"
            label="Вид фразы"
            value={kind}
            onChange={(e) => setKind(e.target.value as PhraseKind)}
          >
            {PHRASE_KINDS.map((phraseKind) => (
              <MenuItem key={phraseKind} value={phraseKind}>
                {PHRASE_KIND_META[phraseKind].label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Название (необязательно)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </>
      ) : (
        <TextField
          select
          size="small"
          label="Где учитывать"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <MenuItem value="global">во всех ходах</MenuItem>
          <MenuItem value="stage:offer">на этапе предложения</MenuItem>
          <MenuItem value="stage:price">на этапе цен</MenuItem>
          <MenuItem value="stage:reminders">в напоминаниях</MenuItem>
        </TextField>
      )}
      <TextField
        fullWidth
        multiline
        minRows={3}
        size="small"
        label={mode === 'example' ? 'Текст образца' : 'Что учесть боту'}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={mode === 'note' ? 'Не предлагай работу с родом, пока клиент сам не спросит' : undefined}
      />
      <Typography variant="caption" color="text.secondary">
        {mode === 'example'
          ? 'Образцы бот перефразирует под контекст, дословно не копирует.'
          : 'Заметка подмешивается в каждый ход бота по выбранной области.'}
      </Typography>
    </FormDialog>
  )
}
