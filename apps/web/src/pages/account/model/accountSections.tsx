import type { ReactNode } from 'react';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import { accountLinks } from '@/shared/config';

export type AccountSection = 'stats' | 'chats' | 'handoffs' | 'bot' | 'sandbox';

export interface AccountSectionItem {
  key: AccountSection;
  label: string;
  icon: ReactNode;
  link: (accountId: string) => string;
}

/** Вкладки аккаунта: подпись, иконка и как собрать ссылку. */
export const ACCOUNT_SECTIONS: AccountSectionItem[] = [
  {
    key: 'stats',
    label: 'Статистика',
    icon: <InsightsOutlinedIcon fontSize="small" />,
    link: accountLinks.stats,
  },
  {
    key: 'chats',
    label: 'Чаты',
    icon: <ForumOutlinedIcon fontSize="small" />,
    link: accountLinks.chats,
  },
  {
    key: 'handoffs',
    label: 'У менеджера',
    icon: <SupportAgentOutlinedIcon fontSize="small" />,
    link: accountLinks.handoffs,
  },
  {
    key: 'bot',
    label: 'Агент',
    icon: <SmartToyOutlinedIcon fontSize="small" />,
    link: accountLinks.bot,
  },
  {
    key: 'sandbox',
    label: 'Песочница',
    icon: <ScienceOutlinedIcon fontSize="small" />,
    link: (accountId) => accountLinks.sandbox(accountId),
  },
];

/** Раздел по сегменту пути; незнакомый — статистика (туда же ведёт редирект). */
export function findSection(segment: string | undefined): AccountSectionItem {
  return (
    ACCOUNT_SECTIONS.find((item) => item.key === segment) ??
    ACCOUNT_SECTIONS[0]!
  );
}
