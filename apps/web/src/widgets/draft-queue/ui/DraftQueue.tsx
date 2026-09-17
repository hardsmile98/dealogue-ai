import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { accountLinks } from '@/shared/config'
import { formatRelative, getApiErrorMessage } from '@/shared/lib'
import type { DraftListItemDto } from '@/shared/api'
import { FUNNEL_STAGE_META } from '@/entities/ai-agent'
import {
  DRAFT_KIND_META,
  useDismissDraftMutation,
  useGetDraftsQuery,
  useSendDraftMutation,
} from '@/entities/ai-draft'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'
import { AccountAvatar } from '@/entities/telegram-account'

/**
 * Очередь черновиков по всем аккаунтам (раздел 12.3 ТЗ): кто написал, почему
 * бот остановился, что он предлагает ответить, и быстрые действия. Правки —
 * в чате.
 */
export function DraftQueue() {
  const { data, isLoading, error } = useGetDraftsQuery({ limit: 30 }, { pollingInterval: 30_000 })

  if (error) {
    return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить черновики')}</Alert>
  }
  if (isLoading) {
    return (
      <Stack spacing={1.5}>
        {[0, 1].map((i) => (
          <Skeleton key={i} variant="rounded" height={112} sx={{ borderRadius: 3 }} />
        ))}
      </Stack>
    )
  }
  if (!data || data.length === 0) return null

  return (
    <Stack spacing={1.5} sx={{ mb: 3 }}>
      <Typography variant="subtitle2" color="text.secondary">
        Черновики ответов · {data.length}
      </Typography>
      {data.map((draft) => (
        <DraftRow key={draft.id} draft={draft} />
      ))}
    </Stack>
  )
}

function DraftRow({ draft }: { draft: DraftListItemDto }) {
  const [send, { isLoading: sending, error: sendError }] = useSendDraftMutation()
  const [dismiss, { isLoading: dismissing, error: dismissError }] = useDismissDraftMutation()
  const meta = DRAFT_KIND_META[draft.kind]
  const suggested = draft.messages.map((m) => m.text)
  const who = [draft.chat?.peerName, draft.chat?.peerUsername ? `@${draft.chat.peerUsername}` : null].filter(Boolean).join(' ')
  const args = { accountId: draft.accountId, draftId: draft.id, chatId: draft.chatId }
  const busy = sending || dismissing
  const error = sendError ?? dismissError

  return (
    <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <AccountAvatar name={draft.chat?.peerName ?? '?'} size={44} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
            <Chip size="small" color={meta.color} label={meta.label} />
            {draft.handoffReason && (
              <Chip size="small" variant="outlined" label={HANDOFF_REASON_LABELS[draft.handoffReason] ?? draft.handoffReason} />
            )}
            {draft.stage && <Chip size="small" variant="outlined" label={FUNNEL_STAGE_META[draft.stage].short} />}
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{formatRelative(draft.createdAt)}</Typography>
          </Stack>
          <Typography sx={{ fontWeight: 600 }}>{who || 'Клиент'}</Typography>
          {draft.account && (
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>аккаунт {draft.account.displayName}</Typography>
          )}
          {draft.clientText && (
            <Typography sx={{ fontSize: 13, mt: 0.75, fontStyle: 'italic', color: 'text.secondary' }}>
              «{draft.clientText.length > 200 ? `${draft.clientText.slice(0, 200)}…` : draft.clientText}»
            </Typography>
          )}
          {suggested.length > 0 && (
            <Box sx={{ mt: 0.75, px: 1, py: 0.75, borderRadius: 1.5, bgcolor: 'rgba(16, 24, 40, 0.04)', whiteSpace: 'pre-wrap', fontSize: 13 }}>
              {suggested.join('\n\n')}
            </Box>
          )}
          {draft.rationale && suggested.length === 0 && (
            <Typography sx={{ fontSize: 13, mt: 0.75, color: 'text.secondary' }}>{draft.rationale}</Typography>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {getApiErrorMessage(error, 'Не удалось выполнить действие')}
            </Alert>
          )}
        </Box>
        <Stack spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'flex-end' }, flexShrink: 0 }}>
          <Button
            component={RouterLink}
            to={accountLinks.chat(draft.accountId, draft.chatId)}
            variant="contained"
            size="small"
          >
            Открыть чат
          </Button>
          {suggested.length > 0 && (
            <Button size="small" variant="outlined" disabled={busy} onClick={() => void send({ ...args, body: { messages: suggested } })}>
              Отправить как есть
            </Button>
          )}
          <Button size="small" variant="text" disabled={busy} onClick={() => void dismiss(args)}>
            Не отвечать
          </Button>
        </Stack>
      </Stack>
    </Card>
  )
}
