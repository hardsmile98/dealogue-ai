import Grid from '@mui/material/Grid';
import { formatNumber, formatShare, pluralize } from '@/shared/lib';
import { StatTile } from '@/shared/ui';
import type { AccountStats } from '@/entities/telegram-account';
import { NO_CODE_KEY, percentDelta } from '../lib/buildSeries';
import type { StatsSeriesModel } from '../lib/buildSeries';

interface StatsTilesProps {
  stats: AccountStats;
  model: StatsSeriesModel;
}

const TILE_SIZE = { xs: 12, sm: 6, lg: 3 } as const;

/** «к предыдущему дню» / «к прошлым 7 дням». */
function versusLabel(days: number): string {
  return days === 1
    ? 'к предыдущему дню'
    : `к прошлым ${pluralize(days, ['дню', 'дням', 'дням'])}`;
}

/** Четыре итога периода: всего, с кодом, без кода, самый частый код. */
export function StatsTiles({ stats, model }: StatsTilesProps) {
  const { totals } = stats;
  const topCode = stats.codes[0] ?? null;

  return (
    <Grid container spacing={2}>
      <Grid size={TILE_SIZE}>
        <StatTile
          label="Новых диалогов"
          value={formatNumber(totals.total)}
          delta={{
            percent: percentDelta(totals.total, stats.previousTotals.total),
            versus: versusLabel(stats.days.length),
          }}
        />
      </Grid>
      <Grid size={TILE_SIZE}>
        <StatTile
          label="С кодом"
          value={formatNumber(totals.withCode)}
          caption={`${formatShare(totals.withCode, totals.total)} от всех новых диалогов`}
        />
      </Grid>
      <Grid size={TILE_SIZE}>
        <StatTile
          label="Без кода"
          value={formatNumber(totals.withoutCode)}
          caption={`${formatShare(totals.withoutCode, totals.total)} от всех новых диалогов`}
          swatchColor={model.colorByKey[NO_CODE_KEY]}
        />
      </Grid>
      <Grid size={TILE_SIZE}>
        <StatTile
          label="Самый частый код"
          value={topCode ? `Код ${topCode.code}` : '—'}
          caption={
            topCode
              ? `${pluralize(topCode.count, ['диалог', 'диалога', 'диалогов'])} · ${formatShare(topCode.count, totals.total)}`
              : 'Кодов за период не было'
          }
          swatchColor={topCode ? model.colorByKey[topCode.code] : undefined}
        />
      </Grid>
    </Grid>
  );
}
