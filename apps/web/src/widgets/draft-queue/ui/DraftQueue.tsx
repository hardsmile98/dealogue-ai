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
import { QueryBoundary } from '@/shared/ui'
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
import { draftQueueStyles as styles } from './DraftQueue.styles'

/** Цитату клиента показываем одной репликой: полная переписка — в чате. */
const CLIENT_TEXT_LIMIT = 200

/**
 * Очередь черновиков по всем аккаунтам (раздел 12.3 ТЗ): кто написал, почему
 * бот остановился, что он предлагает ответить, и быстрые действия. Правки —
 * в чате.
 */
export function DraftQueue() {
  const query = useGetDraftsQuery({ limit: 30 }, { pollingInterval: 30_000 })

  return (
    <QueryBoundary
      query={query}
      errorText="Не удалось загрузить черновики"
      skeleton={
        <Stack spacing={1.5}>
          {[0, 1].map((index) => (
            <Skeleton key={index} variant="rounded" height={112} />
          ))}
        </Stack>
      }
      // Пустая очередь — это норма, а не состояние, о котором надо сообщать:
      // ниже на странице идёт список алертов со своей заглушкой.
      empty={null}
    >
      {(drafts) => (
        <Stack spacing={1.5} sx={styles.root}>
          <Typography variant="subtitle2" color="text.secondary">
            Черновики ответов · {drafts.length}
          </Typography>
          {drafts.map((draft) => (
            <DraftRow key={draft.id} draft={draft} />
          ))}
        </Stack>
      )}
    </QueryBoundary>
  )
}

function DraftRow({ draft }: { draft: DraftListItemDto }) {
  const [send, { isLoading: sending, error: sendError }] = useSendDraftMutation()
  const [dismiss, { isLoading: dismissing, error: dismissError }] = useDismissDraftMutation()

  const meta = DRAFT_KIND_META[draft.kind]
  const suggested = draft.messages.map((message) => message.text)
  const who = [draft.chat?.peerName, draft.chat?.peerUsername ? `@${draft.chat.peerUsername}` : null]
    .filter(Boolean)
    .join(' ')
  const args = { accountId: draft.accountId, draftId: draft.id, chatId: draft.chatId }
  const busy = sending || dismissing
  const error = sendError ?? dismissError

  return (
    <Card variant="outlined" sx={styles.card}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <AccountAvatar name={draft.chat?.peerName ?? '?'} size={44} />
        <Box sx={styles.body}>
          <Stack direction="row" spacing={1} sx={styles.chips}>
            <Chip size="small" color={meta.color} label={meta.label} />
            {draft.handoffReason && (
              <Chip
                size="small"
                variant="outlined"
                label={HANDOFF_REASON_LABELS[draft.handoffReason] ?? draft.handoffReason}
              />
            )}
            {draft.stage && <Chip size="small" variant="outlined" label={FUNNEL_STAGE_META[draft.stage].short} />}
            <Typography sx={styles.meta}>{formatRelative(draft.createdAt)}</Typography>
          </Stack>
          <Typography sx={styles.who}>{who || 'Клиент'}</Typography>
          {draft.account && <Typography sx={styles.meta}>аккаунт {draft.account.displayName}</Typography>}
          {draft.clientText && (
            <Typography sx={styles.quote}>
              «
              {draft.clientText.length > CLIENT_TEXT_LIMIT
                ? `${draft.clientText.slice(0, CLIENT_TEXT_LIMIT)}…`
                : draft.clientText}
              »
            </Typography>
          )}
          {suggested.length > 0 && <Box sx={styles.suggestion}>{suggested.join('\n\n')}</Box>}
          {draft.rationale && suggested.length === 0 && (
            <Typography sx={styles.rationale}>{draft.rationale}</Typography>
          )}
          {error && (
            <Alert severity="error" sx={styles.error}>
              {getApiErrorMessage(error, 'Не удалось выполнить действие')}
            </Alert>
          )}
        </Box>
        <Stack spacing={1} sx={styles.actions}>
          <Button
            component={RouterLink}
            to={accountLinks.chat(draft.accountId, draft.chatId)}
            variant="contained"
            size="small"
          >
            Открыть чат
          </Button>
          {suggested.length > 0 && (
            <Button
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={() => void send({ ...args, body: { messages: suggested } })}
            >
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
