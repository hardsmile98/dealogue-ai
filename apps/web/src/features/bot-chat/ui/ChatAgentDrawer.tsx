import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import type { ChatBotStateDto } from '@/shared/api';
import { formatDateTime, joinParts } from '@/shared/lib';
import { QueryBoundary } from '@/shared/ui';
import {
  BotJournal,
  CHAT_LABEL_LABELS,
  ChatModeChip,
  HANDOFF_REASON_LABELS,
  JournalTabs,
  StageChip,
  turnAnchorId,
  useGetChatBotStateQuery,
  useGetChatJournalQuery,
} from '@/entities/bot';
import type { JournalTab } from '@/entities/bot';
import { ChatModeActions } from './ChatModeActions';
import { chatAgentDrawerStyles as styles } from './ChatAgentDrawer.styles';

interface ChatAgentDrawerProps {
  accountId: string;
  chatId: string;
  open: boolean;
  /** Ход, который раскрыть сразу — по клику на сообщение агента. */
  focusTurnId: string | null;
  onClose: () => void;
}

/**
 * Панель агента в чате: чей чат и почему, включить или выключить агента,
 * журнал ходов (что понял, что решил, что поправили), память о клиенте и
 * запланированные ступени лестницы молчания.
 */
export function ChatAgentDrawer({
  accountId,
  chatId,
  open,
  focusTurnId,
  onClose,
}: ChatAgentDrawerProps) {
  const args = { accountId, chatId };
  const stateQuery = useGetChatBotStateQuery(args, { skip: !open });
  const journal = useGetChatJournalQuery(args, { skip: !open });
  const [tab, setTab] = useState<JournalTab>('journal');
  const state = stateQuery.data?.state ?? null;
  const journalData = journal.data?.journal ?? undefined;

  // Открыли по сообщению агента — сразу на вкладку журнала. Подстраиваем
  // состояние при смене пропсов прямо в рендере, без лишнего эффекта.
  const focusRequest = open ? focusTurnId : null;
  const [appliedFocus, setAppliedFocus] = useState<string | null>(null);
  if (focusRequest !== appliedFocus) {
    setAppliedFocus(focusRequest);
    if (focusRequest) setTab('journal');
  }

  // …и один раз прокручиваем к ходу. Потом журнал обновляется живыми
  // событиями, и дёргать ленту незачем.
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      scrolledTo.current = null;
      return;
    }
    if (!focusTurnId || tab !== 'journal') return;
    if (scrolledTo.current === focusTurnId || !journalData) return;
    const turn = document.getElementById(turnAnchorId(focusTurnId));
    if (!turn) return;
    scrolledTo.current = focusTurnId;
    turn.scrollIntoView({ block: 'start' });
  }, [open, focusTurnId, journalData, tab]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: styles.paper,
          'aria-labelledby': 'chat-agent-drawer-title',
        },
      }}
    >
      <Box sx={styles.header}>
        <Box sx={styles.titleRow}>
          <Typography
            id="chat-agent-drawer-title"
            variant="subtitle1"
            component="h2"
            sx={styles.title}
          >
            Агент в чате
          </Typography>
          <IconButton size="small" aria-label="Закрыть" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <AgentStatus state={state} loading={stateQuery.isLoading} />
        {!stateQuery.isLoading && (
          <Box sx={styles.actions}>
            <ChatModeActions
              accountId={accountId}
              chatId={chatId}
              state={state}
            />
          </Box>
        )}
      </Box>

      <JournalTabs
        value={tab}
        onChange={setTab}
        data={journalData}
        sx={styles.tabs}
      />

      <Box sx={styles.body}>
        <QueryBoundary
          query={journal}
          errorText="Не удалось загрузить журнал"
          isEmpty={(response) => response.journal === null}
          empty="Агент в этом чате ещё не работал."
        >
          {(response) =>
            response.journal && (
              <BotJournal
                tab={tab}
                data={response.journal}
                focusTurnId={focusTurnId}
              />
            )
          }
        </QueryBoundary>
      </Box>
    </Drawer>
  );
}

/** Режим, этап, ярлык и причина передачи менеджеру. */
function AgentStatus({
  state,
  loading,
}: {
  state: ChatBotStateDto | null;
  loading: boolean;
}) {
  if (loading) return null;
  if (!state) {
    return (
      <Typography variant="body2" color="text.secondary">
        Агент этот чат не вёл.
      </Typography>
    );
  }

  return (
    <>
      <Box sx={styles.meta}>
        <ChatModeChip mode={state.mode} />
        <StageChip stage={state.stage} />
        {state.label && (
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={CHAT_LABEL_LABELS[state.label]}
          />
        )}
      </Box>
      {state.handoffReason && (
        <Typography variant="body2" sx={styles.reason}>
          {joinParts([
            HANDOFF_REASON_LABELS[state.handoffReason],
            state.handoffAt && formatDateTime(state.handoffAt),
          ])}
        </Typography>
      )}
    </>
  );
}
