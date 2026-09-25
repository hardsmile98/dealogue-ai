import { Link as RouterLink, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { CHAT_LABEL_LABELS, HANDOFF_REASON_LABELS, STAGE_LABELS } from '@/shared/api'
import type { HandoffChatDto } from '@/shared/api'
import { accountLinks } from '@/shared/config'
import { formatRelative } from '@/shared/lib'
import { QueryBoundary, SectionCard } from '@/shared/ui'
import { useGetHandoffsQuery } from '@/entities/bot'

/** Живые события обновляют список сами; опрос — страховка и счётчик «ждёт N минут». */
const POLL_MS = 60_000

const styles = {
  item: { alignItems: 'flex-start', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider' },
  text: { minWidth: 0, flexGrow: 1 },
  name: { fontWeight: 600, fontSize: 14 },
  last: {
    fontSize: 13,
    color: 'text.secondary',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: { display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center', mt: 0.5 },
} as const

function groupTitle(chat: HandoffChatDto): string {
  if (chat.label === 'needs_reply' || chat.label === 'agent_unavailable') return 'Ждут ответа'
  if (chat.label === 'prices_silent') return 'Цены отправлены, молчат'
  return 'Ведёт менеджер'
}

/**
 * «У менеджера»: чаты, которые агент передал. Сверху — ждущие ответа, дольше
 * всех ждущие первыми; ниже — получившие цены и молчащие; потом — те, что
 * менеджер уже ведёт.
 */
export function AccountHandoffsPage() {
  const { accountId = '' } = useParams<{ accountId: string }>()
  const query = useGetHandoffsQuery(accountId, { skip: accountId === '', pollingInterval: POLL_MS })

  return (
    <SectionCard title="У менеджера" subtitle="Чаты, которые агент передал: после цен, по просьбе клиента, из-за медиа или сбоя.">
      <QueryBoundary query={query} errorText="Не удалось загрузить чаты у менеджера" empty="Передач пока нет.">
        {(chats) => (
          <List disablePadding>
            {chats.map((chat, index) => {
              const group = groupTitle(chat)
              const first = index === 0 || groupTitle(chats[index - 1] as HandoffChatDto) !== group
              return (
                <Box key={chat.chatId}>
                  {first && (
                    <Typography sx={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary', mt: index ? 2 : 0, mb: 0.5 }}>
                      {group}
                    </Typography>
                  )}
                  <ListItemButton component={RouterLink} to={accountLinks.chat(accountId, chat.chatId)} sx={styles.item}>
                    <Box sx={styles.text}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography sx={styles.name}>{chat.peerName}</Typography>
                        {chat.label && (
                          <Chip
                            size="small"
                            color={chat.label === 'prices_silent' ? 'default' : 'warning'}
                            label={CHAT_LABEL_LABELS[chat.label]}
                          />
                        )}
                      </Stack>
                      <Typography sx={styles.last}>
                        {chat.lastMessageDirection === 'out' ? 'Вы: ' : ''}
                        {chat.lastMessageText || '—'}
                      </Typography>
                      <Box sx={styles.meta}>
                        <Chip size="small" variant="outlined" label={STAGE_LABELS[chat.stage]} />
                        {chat.handoffReason && (
                          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{HANDOFF_REASON_LABELS[chat.handoffReason]}</Typography>
                        )}
                        {chat.waitingSince && (
                          <Typography sx={{ fontSize: 12, color: 'warning.main' }}>клиент написал {formatRelative(chat.waitingSince)}</Typography>
                        )}
                      </Box>
                    </Box>
                  </ListItemButton>
                </Box>
              )
            })}
          </List>
        )}
      </QueryBoundary>
    </SectionCard>
  )
}
