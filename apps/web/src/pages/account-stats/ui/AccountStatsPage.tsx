import { useParams } from 'react-router-dom';
import { AccountStatsDashboard } from '@/widgets/account-stats';

/** Вкладка «Статистика»: первые сообщения по дням и кодам. */
export function AccountStatsPage() {
  const { accountId = '' } = useParams<{ accountId: string }>();
  return <AccountStatsDashboard key={accountId} accountId={accountId} />;
}
