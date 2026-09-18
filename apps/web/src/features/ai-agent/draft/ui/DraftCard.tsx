import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { DraftDto } from '@/shared/api'
import { formatRelative, getApiErrorMessage } from '@/shared/lib'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'
import { useGetAiSettingsQuery } from '@/entities/ai-agent'
import {
  DRAFT_KIND_META,
  useDismissDraftMutation,
  useRegenerateDraftMutation,
  useSendDraftMutation,
} from '@/entities/ai-draft'
import { SaveDraftDialog } from './SaveDraftDialog'
import { SimilarCases } from './SimilarCases'
import { draftCardStyles as styles } from './DraftCard.styles'

interface DraftCardProps {
  accountId: string
  chatId: string
  draft: DraftDto
}

interface EditState {
  /** Черновик и предложенный текст, из которых собрана форма. */
  signature: string
  texts: string[]
  /** Менеджер пишет свой ответ, а не правит предложенный. */
  own: boolean
}

function initialEdit(signature: string, suggested: string[]): EditState {
  return {
    signature,
    texts: suggested.length > 0 ? suggested : [''],
    own: suggested.length === 0,
  }
}

/**
 * Черновик в панели чата: сообщения в редактируемых полях, обоснование и
 * решения менеджера — отправить как есть, с правками, свой ответ, не отвечать
 * (раздел 12.2 ТЗ).
 */
export function DraftCard({ accountId, chatId, draft }: DraftCardProps) {
  const { data: settings } = useGetAiSettingsQuery(accountId)
  const [send, { isLoading: sending, error: sendError }] = useSendDraftMutation()
  const [dismiss, { isLoading: dismissing, error: dismissError }] = useDismissDraftMutation()
  const [regenerate, { isLoading: regenerating, error: regenerateError }] = useRegenerateDraftMutation()

  const suggested = draft.messages.map((message) => message.text)
  const signature = JSON.stringify([draft.id, suggested])
  const [edit, setEdit] = useState(() => initialEdit(signature, suggested))
  const [saveAs, setSaveAs] = useState<'example' | 'note' | null>(null)
  const [saveText, setSaveText] = useState('')

  // Черновик переписали (или пришёл новый) — показываем свежий текст.
  if (edit.signature !== signature) setEdit(initialEdit(signature, suggested))

  const { texts, own } = edit
  const meta = DRAFT_KIND_META[draft.kind]
  const filled = texts.map((text) => text.trim()).filter(Boolean)
  const edited =
    own || filled.length !== suggested.length || filled.some((text, i) => text !== suggested[i]?.trim())
  const busy = sending || dismissing || regenerating
  const error = sendError ?? dismissError ?? regenerateError

  const setTexts = (next: string[]) => setEdit({ ...edit, texts: next })

  const submit = () => {
    if (filled.length === 0) return
    void send({ accountId, draftId: draft.id, chatId, body: { messages: filled, own } })
  }

  return (
    <Box sx={[styles.root, { borderColor: meta.color === 'info' ? 'info.main' : 'warning.main' }]}>
      <Stack direction="row" spacing={0.75} sx={styles.header}>
        <Chip size="small" color={meta.color} label={meta.label} />
        {draft.handoffReason && (
          <Chip
            size="small"
            variant="outlined"
            label={HANDOFF_REASON_LABELS[draft.handoffReason] ?? draft.handoffReason}
          />
        )}
        <Typography variant="caption" color="text.secondary">
          {formatRelative(draft.createdAt)}
        </Typography>
      </Stack>

      {draft.rationale && (
        <Typography variant="body2" color="text.secondary" sx={styles.block}>
          {draft.rationale}
        </Typography>
      )}
      {draft.similarCases.length > 0 && <SimilarCases cases={draft.similarCases} />}
      {suggested.length === 0 && (
        <Alert severity="info" sx={styles.block}>
          Бот не предложил текст — напишите ответ сами или откройте переписку целиком.
        </Alert>
      )}
      {settings?.dryRun && (
        <Alert severity="warning" sx={styles.block}>
          Сухой прогон: сообщение не уйдёт в Telegram, черновик просто закроется.
        </Alert>
      )}

      <Stack spacing={1}>
        {texts.map((text, index) => (
          <TextField
            key={index}
            fullWidth
            multiline
            size="small"
            minRows={2}
            maxRows={12}
            value={text}
            onChange={(e) => setTexts(texts.map((item, i) => (i === index ? e.target.value : item)))}
            label={texts.length > 1 ? `Сообщение ${index + 1}` : undefined}
            placeholder="Ответ клиенту"
          />
        ))}
      </Stack>

      {error && (
        <Alert severity="error" sx={styles.error}>
          {getApiErrorMessage(error, 'Не удалось выполнить действие')}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={styles.actions}>
        <Button size="small" variant="contained" disabled={busy || filled.length === 0} onClick={submit}>
          {edited ? 'Отправить с правками' : 'Отправить как есть'}
        </Button>
        {!own && (
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={() => setEdit({ signature, texts: [''], own: true })}
          >
            Свой ответ
          </Button>
        )}
        <Button
          size="small"
          variant="outlined"
          disabled={busy}
          onClick={() => void dismiss({ accountId, draftId: draft.id, chatId })}
        >
          Не отвечать
        </Button>
        <Button
          size="small"
          variant="text"
          disabled={busy}
          loading={regenerating}
          onClick={() => void regenerate({ accountId, draftId: draft.id, chatId })}
        >
          Переписать
        </Button>
        <Box sx={styles.spacer} />
        <Button
          size="small"
          variant="text"
          disabled={filled.length === 0}
          onClick={() => {
            setSaveText(filled.join('\n\n'))
            setSaveAs('example')
          }}
        >
          В примеры
        </Button>
        <Button
          size="small"
          variant="text"
          onClick={() => {
            setSaveText('')
            setSaveAs('note')
          }}
        >
          В заметки
        </Button>
      </Stack>

      <SaveDraftDialog
        mode={saveAs}
        onClose={() => setSaveAs(null)}
        accountId={accountId}
        chatId={chatId}
        draftId={draft.id}
        text={saveText}
        onTextChange={setSaveText}
      />
    </Box>
  )
}
