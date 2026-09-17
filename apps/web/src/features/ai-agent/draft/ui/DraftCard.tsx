import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { PHRASE_KINDS } from '@/shared/api'
import type { DraftDto, PhraseKind, SimilarCaseDto } from '@/shared/api'
import { formatRelative, getApiErrorMessage } from '@/shared/lib'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'
import { useGetAiSettingsQuery } from '@/entities/ai-agent'
import {
  DRAFT_KIND_META,
  useDismissDraftMutation,
  useDraftToExampleMutation,
  useDraftToNoteMutation,
  useRegenerateDraftMutation,
  useSendDraftMutation,
} from '@/entities/ai-draft'

interface DraftCardProps {
  accountId: string
  chatId: string
  draft: DraftDto
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

  const suggested = draft.messages.map((m) => m.text)
  const signature = JSON.stringify([draft.id, suggested])
  const [edit, setEdit] = useState(() => initialEdit(signature, suggested))
  const [saveAs, setSaveAs] = useState<'example' | 'note' | null>(null)
  const [saveText, setSaveText] = useState('')

  // Черновик переписали (или пришёл новый) — показываем свежий текст.
  if (edit.signature !== signature) setEdit(initialEdit(signature, suggested))

  const { texts, own } = edit
  const setTexts = (next: string[]) => setEdit({ ...edit, texts: next })
  const meta = DRAFT_KIND_META[draft.kind]
  const filled = texts.map((t) => t.trim()).filter(Boolean)
  const edited = own || filled.length !== suggested.length || filled.some((text, i) => text !== suggested[i]?.trim())
  const busy = sending || dismissing || regenerating
  const error = sendError ?? dismissError ?? regenerateError

  const submit = () => {
    if (filled.length === 0) return
    void send({ accountId, draftId: draft.id, chatId, body: { messages: filled, own } })
  }

  return (
    <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, border: '1px solid', borderColor: meta.color === 'info' ? 'info.main' : 'warning.main' }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
        <Chip size="small" color={meta.color} label={meta.label} />
        {draft.handoffReason && (
          <Chip size="small" variant="outlined" label={HANDOFF_REASON_LABELS[draft.handoffReason] ?? draft.handoffReason} />
        )}
        <Typography variant="caption" color="text.secondary">
          {formatRelative(draft.createdAt)}
        </Typography>
      </Stack>

      {draft.rationale && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {draft.rationale}
        </Typography>
      )}
      {draft.similarCases.length > 0 && <SimilarCases cases={draft.similarCases} />}
      {suggested.length === 0 && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Бот не предложил текст — напишите ответ сами или откройте переписку целиком.
        </Alert>
      )}
      {settings?.dryRun && (
        <Alert severity="warning" sx={{ mb: 1 }}>
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
            onChange={(e) => setTexts(texts.map((t, i) => (i === index ? e.target.value : t)))}
            label={texts.length > 1 ? `Сообщение ${index + 1}` : undefined}
            placeholder="Ответ клиенту"
          />
        ))}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {getApiErrorMessage(error, 'Не удалось выполнить действие')}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
        <Button size="small" variant="contained" disabled={busy || filled.length === 0} onClick={submit}>
          {edited ? 'Отправить с правками' : 'Отправить как есть'}
        </Button>
        {!own && (
          <Button size="small" variant="outlined" disabled={busy} onClick={() => setEdit({ signature, texts: [''], own: true })}>
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
        <Box sx={{ flexGrow: 1 }} />
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

      <SaveDialog
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

interface EditState {
  /** Черновик и предложенный текст, из которых собрана форма. */
  signature: string
  texts: string[]
  own: boolean
}

function initialEdit(signature: string, suggested: string[]): EditState {
  return { signature, texts: suggested.length > 0 ? suggested : [''], own: suggested.length === 0 }
}

// --- на что опирался бот ------------------------------------------------------------

/** Похожие прошлые случаи из промпта: что писал клиент и чем тогда ответили. */
function SimilarCases({ cases }: { cases: SimilarCaseDto[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Box sx={{ mb: 1 }}>
      <Button size="small" variant="text" sx={{ px: 0, minWidth: 0 }} onClick={() => setOpen(!open)}>
        {open ? 'Скрыть похожие случаи' : `Похожие случаи из переписок (${cases.length})`}
      </Button>
      <Collapse in={open}>
        <Stack spacing={1} sx={{ mt: 0.5 }}>
          {cases.map((item) => (
            <Box key={item.id} sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {item.source === 'draft' ? 'ответил менеджер' : 'удачный ход бота'} · {formatRelative(item.createdAt)}
              </Typography>
              <Typography variant="body2">Клиент: {cut(item.clientText, 200)}</Typography>
              <Typography variant="body2" color="text.secondary">
                Ответ: {cut(item.answerText, 300)}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  )
}

function cut(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

// --- «Сохранить как пример / заметку» ------------------------------------------------

interface SaveDialogProps {
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
function SaveDialog({ mode, onClose, accountId, chatId, draftId, text, onTextChange }: SaveDialogProps) {
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
    if (!('error' in result)) {
      setTitle('')
      onClose()
    }
  }

  return (
    <Dialog open={mode !== null} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{mode === 'example' ? 'Сохранить как образец' : 'Сохранить как заметку'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mode === 'example' ? (
            <>
              <TextField select size="small" label="Вид фразы" value={kind} onChange={(e) => setKind(e.target.value as PhraseKind)}>
                {PHRASE_KINDS.map((k) => (
                  <MenuItem key={k} value={k}>
                    {k}
                  </MenuItem>
                ))}
              </TextField>
              <TextField size="small" label="Название (необязательно)" value={title} onChange={(e) => setTitle(e.target.value)} />
            </>
          ) : (
            <TextField select size="small" label="Где учитывать" value={scope} onChange={(e) => setScope(e.target.value)}>
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
          {(exampleError ?? noteError) && (
            <Alert severity="error">{getApiErrorMessage(exampleError ?? noteError, 'Не удалось сохранить')}</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" loading={savingExample || savingNote} onClick={() => void submit()}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}
