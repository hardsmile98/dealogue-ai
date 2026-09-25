import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import type { SandboxSessionDto } from '@/shared/api';
import { accountLinks } from '@/shared/config';
import {
  formatDateTime,
  isFetchBaseQueryError,
  useStoredState,
} from '@/shared/lib';
import { EmptyState, QueryBoundary } from '@/shared/ui';
import { ChatModeChip, HANDOFF_REASON_LABELS, StageChip } from '@/entities/bot';
import type { JournalTab } from '@/entities/bot';
import { sandboxApi, useGetSandboxQuery } from '../api/sandboxApi';
import { SandboxComposer } from './SandboxComposer';
import { SandboxFeed } from './SandboxFeed';
import { InspectorRail, SandboxInspector } from './SandboxInspector';
import { sandboxSessionStyles as styles } from './SandboxSession.styles';

/** Пока агент отвечает, сессия опрашивается — ход идёт на сервере в фоне. */
const RUNNING_POLL_MS = 1_000;

interface SandboxSessionProps {
  accountId: string;
  sessionId: string;
  /** Узкий экран: стрелка назад к списку диалогов. */
  onBack?: () => void;
}

/**
 * Открытая сессия: диалог с часами, справа журнал и память. Панель
 * сворачивается в столбик иконок; на узком экране она свёрнута в шапку
 * диалога и открывается вместо переписки.
 */
export function SandboxSession({
  accountId,
  sessionId,
  onBack,
}: SandboxSessionProps) {
  const args = { accountId, sessionId };
  // Чтение кэша без подписки — чтобы решить, опрашивать ли сессию.
  const cached = sandboxApi.endpoints.getSandbox.useQueryState(args);
  const query = useGetSandboxQuery(args, {
    pollingInterval: cached.data?.running ? RUNNING_POLL_MS : 0,
  });

  const theme = useTheme();
  const stacked = useMediaQuery(theme.breakpoints.down('lg'), { noSsr: true });
  const [tab, setTab] = useState<JournalTab>('journal');
  // Колонка справа — настройка вида, её помним между диалогами; на узком
  // экране панель закрывает переписку и при каждом открытии диалога свёрнута.
  const [sideOpen, setSideOpen] = useStoredState('sandbox.inspectorOpen', true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const open = stacked ? sheetOpen : sideOpen;
  const setOpen = stacked ? setSheetOpen : setSideOpen;

  const openInspector = (next?: JournalTab) => {
    if (next) setTab(next);
    setOpen(true);
  };

  // Сессию удалили (в другой вкладке или чисткой) — «Повторить» не поможет.
  if (
    !query.data &&
    isFetchBaseQueryError(query.error) &&
    query.error.status === 404
  ) {
    return (
      <Box sx={styles.missing}>
        <EmptyState
          size="compact"
          icon={<ScienceOutlinedIcon />}
          title="Диалог не найден"
          description="Возможно, его удалили. Выберите другой диалог или начните новый."
          action={
            <Button
              component={RouterLink}
              to={accountLinks.sandbox(accountId)}
              variant="outlined"
            >
              К диалогам песочницы
            </Button>
          }
        />
      </Box>
    );
  }

  return (
    <QueryBoundary
      query={query}
      errorText="Не удалось открыть диалог песочницы"
      skeleton={<SessionSkeleton />}
    >
      {(session) => {
        const inspector = (
          <SandboxInspector
            session={session}
            tab={tab}
            onTabChange={setTab}
            onCollapse={() => setOpen(false)}
            stacked={stacked}
          />
        );
        const sheet = stacked && open;

        return (
          <Box sx={styles.root}>
            <Box sx={styles.dialog}>
              <Box sx={styles.header}>
                {onBack && (
                  <IconButton
                    size="small"
                    onClick={onBack}
                    aria-label="К списку диалогов"
                    sx={styles.backButton}
                  >
                    <ArrowBackIcon fontSize="small" />
                  </IconButton>
                )}
                <SessionHeaderText session={session} />
                {stacked && !open && (
                  <InspectorRail
                    session={session}
                    onOpen={openInspector}
                    vertical={false}
                  />
                )}
              </Box>
              {/* Место под полоску держим всегда — шапка не прыгает, когда ход начался. */}
              <Box sx={styles.progressSlot}>
                {session.running && (
                  <LinearProgress aria-label="Агент отвечает" />
                )}
              </Box>
              {sheet && inspector}
              {/* Под панелью поле ввода только прячется — набранный текст не теряется;
                  ленту же монтируем заново, чтобы она открылась на последнем сообщении. */}
              <Box sx={[styles.chat, sheet && styles.hidden]}>
                {!sheet && <SandboxFeed messages={session.messages} />}
                <SandboxComposer session={session} />
              </Box>
            </Box>
            {!stacked &&
              (open ? (
                inspector
              ) : (
                <InspectorRail
                  session={session}
                  onOpen={openInspector}
                  vertical
                />
              ))}
          </Box>
        );
      }}
    </QueryBoundary>
  );
}

/** Название, этап, режим, причина передачи и виртуальные часы. */
function SessionHeaderText({ session }: { session: SandboxSessionDto }) {
  return (
    <Box sx={styles.headerText}>
      <Typography component="h2" sx={styles.title}>
        {session.title}
      </Typography>
      <Box sx={styles.chips}>
        <StageChip stage={session.stage} />
        <ChatModeChip mode={session.mode} />
        {session.handoffReason && (
          <span>{HANDOFF_REASON_LABELS[session.handoffReason]}</span>
        )}
        <Box
          component="span"
          sx={styles.clock}
          title="Виртуальное время песочницы"
        >
          <ScheduleIcon aria-hidden />
          <span>
            <Box component="span" sx={styles.clockLabel}>
              Время в песочнице:{' '}
            </Box>
            {formatDateTime(session.virtualNow)}
          </span>
        </Box>
      </Box>
    </Box>
  );
}

function SessionSkeleton() {
  return (
    <Box sx={[styles.dialog, styles.skeleton]}>
      <Skeleton variant="rounded" height={48} />
      <Skeleton variant="rounded" height={56} width="60%" />
      <Skeleton
        variant="rounded"
        height={56}
        width="50%"
        sx={styles.skeletonOut}
      />
      <Skeleton variant="rounded" height={56} width="55%" />
    </Box>
  );
}
