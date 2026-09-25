import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import type { SxProps, Theme } from '@mui/material/styles';
import { JOURNAL_TABS, journalTabCount } from './journalTabItems';
import type { JournalData, JournalTab } from './journalTabItems';

interface JournalTabsProps {
  value: JournalTab;
  onChange: (tab: JournalTab) => void;
  /** Без данных — вкладки без счётчиков. */
  data?: JournalData;
  sx?: SxProps<Theme>;
}

/** Вкладки журнала агента со счётчиками: «Журнал (3)», «Задания (1)». */
export function JournalTabs({ value, onChange, data, sx }: JournalTabsProps) {
  return (
    <Tabs
      value={value}
      onChange={(_event, next: JournalTab) => onChange(next)}
      variant="fullWidth"
      aria-label="Журнал агента"
      sx={sx}
    >
      {JOURNAL_TABS.map((item) => {
        const count = data ? journalTabCount(data, item.value) : 0;
        return (
          <Tab
            key={item.value}
            value={item.value}
            label={count ? `${item.label} (${count})` : item.label}
          />
        );
      })}
    </Tabs>
  );
}
