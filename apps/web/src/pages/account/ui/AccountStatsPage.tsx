import { useParams } from 'react-router-dom'
import { AccountStatsDashboard } from '@/widgets/account-stats'

export function AccountStatsPage() {
  const { accountId = '' } = useParams<{ accountId: string }>()
  return <AccountStatsDashboard key={accountId} accountId={accountId} />
}
