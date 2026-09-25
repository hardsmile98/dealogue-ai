import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import FastForwardIcon from '@mui/icons-material/FastForward';
import ReplyIcon from '@mui/icons-material/Reply';
import SendIcon from '@mui/icons-material/Send';
import type { SandboxSessionDto } from '@/shared/api';
import { formatDateTime, getApiErrorMessage } from '@/shared/lib';
import { useNotify } from '@/shared/ui';
import { jobKindLabel } from '@/entities/bot';
import {
  useAddSandboxMessagesMutation,
  useAdvanceSandboxMutation,
  useReadSandboxMutation,
  useRespondSandboxMutation,
  useSetSandboxModeMutation,
} from '../api/sandboxApi';
import { sandboxComposerStyles as styles } from './SandboxComposer.styles';

const SKIPS: { label: string; minutes: number }[] = [
  { label: '+10 мин', minutes: 10 },
  { label: '+1 ч', minutes: 60 },
  { label: '+1 день', minutes: 60 * 24 },
];

interface SandboxComposerProps {
  session: SandboxSessionDto;
}

/**
 * Реплики за клиента и управление временем. Enter — добавить сообщение
 * (клиент пишет несколькими подряд), Ctrl+Enter — добавить и сразу
 * попросить агента ответить на всё новое.
 */
export function SandboxComposer({ session }: SandboxComposerProps) {
  const args = { accountId: session.accountId, sessionId: session.id };
  const [text, setText] = useState('');
  const [addMessages, addState] = useAddSandboxMessagesMutation();
  const [respond, respondState] = useRespondSandboxMutation();
  const [markRead, readState] = useReadSandboxMutation();
  const [advance, advanceState] = useAdvanceSandboxMutation();
  const [setMode, modeState] = useSetSandboxModeMutation();
  const notify = useNotify();

  const busy =
    session.running || respondState.isLoading || advanceState.isLoading;
  const unread = session.messages.some(
    (message) => message.direction === 'out' && !message.readAt,
  );
  const canRespond =
    !busy &&
    session.mode === 'auto' &&
    (session.pendingCount > 0 || text.trim() !== '');

  /** Выполнить действие; при ошибке — уведомление, а не молчание. */
  const run = async (
    action: () => Promise<unknown>,
    errorText: string,
  ): Promise<boolean> => {
    try {
      await action();
      return true;
    } catch (error) {
      notify.error(getApiErrorMessage(error, errorText));
      return false;
    }
  };

  const add = async (thenRespond: boolean) => {
    const value = text.trim();
    if (value) {
      // Поле чистится сразу: клиент пишет следующее сообщение, не дожидаясь сервера.
      setText('');
      const added = await run(
        () => addMessages({ ...args, body: { texts: [value] } }).unwrap(),
        'Не удалось добавить сообщение',
      );
      if (!added) {
        // Не потерять набранное: возвращаем текст в поле.
        setText((current) => (current ? `${value}\n${current}` : value));
        return;
      }
    }
    if (thenRespond && !busy) {
      await run(() => respond(args).unwrap(), 'Агент не ответил');
    }
  };

  const nextJobHint = session.nextJob
    ? `${jobKindLabel(session.nextJob.kind)} — ${formatDateTime(session.nextJob.runAt)}`
    : 'Запланированных событий нет';

  return (
    <Box sx={styles.root}>
      {session.lastError && (
        <Alert severity="warning">Последний ход: {session.lastError}</Alert>
      )}

      <Box sx={styles.inputRow}>
        <TextField
          fullWidth
          multiline
          maxRows={6}
          size="small"
          placeholder="Сообщение за клиента…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            void add(event.ctrlKey || event.metaKey);
          }}
          slotProps={{
            htmlInput: { 'aria-label': 'Сообщение за клиента' },
          }}
        />
        <Tooltip title="Добавить сообщение клиента" describeChild>
          <span>
            <Button
              variant="outlined"
              aria-label="Добавить сообщение клиента"
              onClick={() => void add(false)}
              disabled={!text.trim()}
              loading={addState.isLoading}
              sx={styles.addButton}
            >
              <SendIcon fontSize="small" />
            </Button>
          </span>
        </Tooltip>
      </Box>

      <Box sx={styles.controls}>
        <Button
          variant="contained"
          size="small"
          startIcon={<ReplyIcon />}
          disabled={!canRespond}
          loading={respondState.isLoading}
          loadingPosition="start"
          onClick={() => void add(true)}
        >
          Ответить агентом
          {session.pendingCount > 0 ? ` (${session.pendingCount})` : ''}
        </Button>
        <Button
          size="small"
          startIcon={<DoneAllIcon />}
          disabled={!unread}
          loading={readState.isLoading}
          loadingPosition="start"
          onClick={() =>
            void run(
              () => markRead(args).unwrap(),
              'Не удалось отметить прочтение',
            )
          }
        >
          Клиент прочитал
        </Button>
        <Tooltip title={nextJobHint} describeChild>
          <span>
            <Button
              size="small"
              startIcon={<FastForwardIcon />}
              disabled={busy || !session.nextJob}
              onClick={() =>
                void run(
                  () => advance({ ...args, body: {} }).unwrap(),
                  'Не удалось перемотать время',
                )
              }
            >
              До события
            </Button>
          </span>
        </Tooltip>
        <ButtonGroup
          size="small"
          variant="text"
          disabled={busy}
          aria-label="Промотать время"
        >
          {SKIPS.map((skip) => (
            <Button
              key={skip.minutes}
              onClick={() =>
                void run(
                  () =>
                    advance({
                      ...args,
                      body: { minutes: skip.minutes },
                    }).unwrap(),
                  'Не удалось перемотать время',
                )
              }
            >
              {skip.label}
            </Button>
          ))}
        </ButtonGroup>
        {session.mode !== 'auto' && (
          <Button
            size="small"
            color="warning"
            disabled={busy}
            loading={modeState.isLoading}
            onClick={() =>
              void run(
                () => setMode({ ...args, body: { mode: 'auto' } }).unwrap(),
                'Не удалось вернуть диалог агенту',
              )
            }
          >
            Вернуть агенту
          </Button>
        )}
      </Box>
      <Typography sx={styles.hint}>
        Enter — добавить сообщение, Ctrl+Enter — добавить и попросить ответ.
        Время в песочнице виртуальное: задержки агента не ждутся, а сдвигают
        часы. «Клиент прочитал» нужно для предложения и цен — агент шлёт их
        только после прочтения прошлой вехи.
      </Typography>
    </Box>
  );
}
