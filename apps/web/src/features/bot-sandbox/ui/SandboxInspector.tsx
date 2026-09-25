import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { SandboxSessionDto } from '@/shared/api';
import {
  BotJournal,
  JOURNAL_TABS,
  JournalTabs,
  journalTabCount,
} from '@/entities/bot';
import type { JournalTab } from '@/entities/bot';
import { sandboxInspectorStyles as styles } from './SandboxInspector.styles';

interface SandboxInspectorProps {
  session: SandboxSessionDto;
  tab: JournalTab;
  onTabChange: (tab: JournalTab) => void;
  onCollapse: () => void;
  /** Узкий экран: панель открыта вместо переписки, а не колонкой справа. */
  stacked: boolean;
}

/** Развёрнутая панель: журнал ходов, память о клиенте, задания планировщика. */
export function SandboxInspector({
  session,
  tab,
  onTabChange,
  onCollapse,
  stacked,
}: SandboxInspectorProps) {
  return (
    <Box
      component="aside"
      aria-label="Журнал агента"
      sx={[styles.root, stacked ? styles.stacked : styles.side]}
    >
      <Box sx={styles.bar}>
        <JournalTabs
          value={tab}
          onChange={onTabChange}
          data={session}
          sx={styles.tabs}
        />
        <Tooltip title={stacked ? 'Свернуть — к переписке' : 'Свернуть панель'}>
          <IconButton
            size="small"
            aria-label="Свернуть панель"
            onClick={onCollapse}
          >
            {stacked ? <ExpandLessIcon /> : <ChevronRightIcon />}
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={styles.body}>
        <BotJournal tab={tab} data={session} />
      </Box>
    </Box>
  );
}

interface InspectorRailProps {
  session: SandboxSessionDto;
  /** Без вкладки — развернуть на той, что была открыта. */
  onOpen: (tab?: JournalTab) => void;
  /** Колонка справа от переписки; иначе — строка иконок в шапке диалога. */
  vertical: boolean;
}

/** Свёрнутая панель: иконки вкладок с числами, клик разворачивает нужную. */
export function InspectorRail({
  session,
  onOpen,
  vertical,
}: InspectorRailProps) {
  const placement = vertical ? 'left' : 'bottom';

  return (
    <Box sx={vertical ? styles.rail : styles.railInline}>
      {vertical && (
        <Tooltip title="Развернуть панель" placement={placement}>
          <IconButton
            size="small"
            aria-label="Развернуть панель"
            onClick={() => onOpen()}
          >
            <ChevronLeftIcon />
          </IconButton>
        </Tooltip>
      )}
      {JOURNAL_TABS.map((item) => {
        const count = journalTabCount(session, item.value);
        return (
          <Tooltip key={item.value} title={item.label} placement={placement}>
            <IconButton
              size="small"
              aria-label={count ? `${item.label}: ${count}` : item.label}
              onClick={() => onOpen(item.value)}
            >
              <Badge
                badgeContent={count}
                color="primary"
                max={99}
                sx={styles.railBadge}
              >
                {item.icon}
              </Badge>
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
}
