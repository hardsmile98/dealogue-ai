import type { ReactNode } from 'react';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import type { BotMemoryDto, BotTurnDto, SandboxJobDto } from '@/shared/api';

export type JournalTab = 'journal' | 'memory' | 'jobs';

/** Всё, что показывает журнал: одинаково для реального чата и песочницы. */
export interface JournalData {
  turns: BotTurnDto[];
  memory: BotMemoryDto;
  jobs: SandboxJobDto[];
}

export const JOURNAL_TABS: {
  value: JournalTab;
  label: string;
  icon: ReactNode;
}[] = [
  {
    value: 'journal',
    label: 'Журнал',
    icon: <ReceiptLongOutlinedIcon fontSize="small" />,
  },
  {
    value: 'memory',
    label: 'Память',
    icon: <PsychologyOutlinedIcon fontSize="small" />,
  },
  {
    value: 'jobs',
    label: 'Задания',
    icon: <EventNoteOutlinedIcon fontSize="small" />,
  },
];

/** Число при вкладке: сколько ходов в журнале и сколько заданий ещё ждут. */
export function journalTabCount(data: JournalData, tab: JournalTab): number {
  if (tab === 'journal') return data.turns.length;
  if (tab === 'jobs') {
    return data.jobs.filter((job) => job.status === 'pending').length;
  }
  return 0;
}
