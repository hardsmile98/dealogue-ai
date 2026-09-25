import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { turnAnchorId } from '../../lib/journal';
import { JobsView } from './JobsView';
import { MemoryView } from './MemoryView';
import { TurnCard } from './TurnCard';
import { journalStyles as styles } from './journal.styles';
import type { JournalData, JournalTab } from './journalTabItems';

interface BotJournalProps {
  tab: JournalTab;
  data: JournalData;
  /** Ход, раскрытый сразу; без него раскрыт самый свежий. */
  focusTurnId?: string | null;
}

/**
 * Журнал агента — общий для реального чата и песочницы: ходы (что понял,
 * что решил, что поправили проверки), память о клиенте, задания лестницы
 * молчания. Какую вкладку показать, решает вызывающий.
 */
export function BotJournal({ tab, data, focusTurnId = null }: BotJournalProps) {
  if (tab === 'memory') return <MemoryView memory={data.memory} />;
  if (tab === 'jobs') return <JobsView jobs={data.jobs} />;

  if (data.turns.length === 0) {
    return <Typography sx={styles.muted}>Ходов ещё не было.</Typography>;
  }

  return (
    <>
      {data.turns.map((turn, index) => (
        <Box key={turn.id} id={turnAnchorId(turn.id)}>
          <TurnCard
            turn={turn}
            defaultOpen={focusTurnId ? turn.id === focusTurnId : index === 0}
          />
        </Box>
      ))}
    </>
  );
}
