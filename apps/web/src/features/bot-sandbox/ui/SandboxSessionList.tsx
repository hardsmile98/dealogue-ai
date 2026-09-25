import { Link as RouterLink, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import type { SandboxSummaryDto } from '@/shared/api';
import { accountLinks } from '@/shared/config';
import {
  formatDateTime,
  getApiErrorMessage,
  joinParts,
  pluralize,
} from '@/shared/lib';
import { ConfirmAction, QueryBoundary, useNotify } from '@/shared/ui';
import { MODE_LABELS, STAGE_LABELS } from '@/entities/bot';
import {
  useCreateSandboxMutation,
  useDeleteSandboxMutation,
  useListSandboxesQuery,
} from '../api/sandboxApi';
import { sandboxSessionListStyles as styles } from './SandboxSessionList.styles';

interface SandboxSessionListProps {
  accountId: string;
  selectedId: string | null;
}

/** «Знакомство · 12 сообщений» или «Цены отправлены · У менеджера». */
function describe(session: SandboxSummaryDto): string {
  return joinParts([
    STAGE_LABELS[session.stage],
    session.mode === 'auto'
      ? pluralize(session.messageCount, ['сообщение', 'сообщения', 'сообщений'])
      : MODE_LABELS[session.mode],
  ]);
}

/** Сессии песочницы аккаунта: новая пустая, открыть, удалить. */
export function SandboxSessionList({
  accountId,
  selectedId,
}: SandboxSessionListProps) {
  const navigate = useNavigate();
  const notify = useNotify();
  const query = useListSandboxesQuery(accountId);
  const [create, createState] = useCreateSandboxMutation();
  const [remove] = useDeleteSandboxMutation();

  const createSession = async () => {
    try {
      const session = await create({ accountId }).unwrap();
      navigate(accountLinks.sandbox(accountId, session.id));
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Не удалось создать диалог'));
    }
  };

  const removeSession = async (sessionId: string) => {
    await remove({ accountId, sessionId }).unwrap();
    notify.success('Диалог песочницы удалён');
    if (sessionId === selectedId) navigate(accountLinks.sandbox(accountId));
  };

  return (
    <Box component="nav" aria-label="Диалоги песочницы" sx={styles.root}>
      <Box sx={styles.header}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => void createSession()}
          loading={createState.isLoading}
          loadingPosition="start"
        >
          Новый диалог
        </Button>
        <Typography sx={styles.hint}>
          Пишите за клиента — агент отвечает как в Telegram, но ничего никуда не
          уходит. Диалог из реального чата — кнопкой «В песочницу» в переписке.
        </Typography>
      </Box>

      <Box sx={styles.items}>
        <QueryBoundary
          query={query}
          errorText="Не удалось загрузить песочницу"
          skeleton={[0, 1, 2].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={52}
              sx={styles.skeleton}
            />
          ))}
          empty="Диалогов пока нет."
        >
          {(sessions) => (
            <List dense disablePadding>
              {sessions.map((session) => (
                <ListItem
                  key={session.id}
                  disablePadding
                  // Удаление — соседом ссылки, а не внутри неё: иначе клики
                  // в диалоге подтверждения всплывали до строки и открывали сессию.
                  secondaryAction={
                    <ConfirmAction
                      question="Удалить диалог песочницы?"
                      description="Переписка, память и журнал этого диалога удалятся. Реальные чаты это не затрагивает."
                      confirmLabel="Удалить"
                      destructive
                      errorText="Не удалось удалить диалог"
                      onConfirm={() => removeSession(session.id)}
                    >
                      {(ask) => (
                        <Tooltip title="Удалить диалог">
                          <IconButton
                            size="small"
                            edge="end"
                            aria-label={`Удалить диалог «${session.title}»`}
                            onClick={ask}
                          >
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </ConfirmAction>
                  }
                >
                  <ListItemButton
                    component={RouterLink}
                    to={accountLinks.sandbox(accountId, session.id)}
                    selected={session.id === selectedId}
                    aria-current={
                      session.id === selectedId ? 'page' : undefined
                    }
                  >
                    <Box sx={styles.itemText}>
                      <Typography sx={styles.itemTitle}>
                        {session.title}
                      </Typography>
                      <Typography sx={styles.itemMeta}>
                        {describe(session)}
                      </Typography>
                      <Typography sx={styles.itemMeta}>
                        {formatDateTime(session.updatedAt)}
                      </Typography>
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </QueryBoundary>
      </Box>
    </Box>
  );
}
