import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { QueryBoundary, SectionCard, StackedColumnChart } from '@/shared/ui';
import { useGetAccountStatsQuery } from '@/entities/telegram-account';
import type { AccountStats } from '@/entities/telegram-account';
import { buildStatsSeries } from '../lib/buildSeries';
import { useStatsPeriod } from '../model/useStatsPeriod';
import { accountStatsStyles as styles } from './AccountStats.styles';
import { CodesTable } from './CodesTable';
import { DailyTable } from './DailyTable';
import { PeriodFilter } from './PeriodFilter';
import { StatsTiles } from './StatsTiles';

/** Живые события статистику не трогают — обновляем раз в минуту. */
const POLLING_INTERVAL_MS = 60_000;

interface AccountStatsDashboardProps {
  accountId: string;
}

/**
 * Статистика первых сообщений: сколько людей написали впервые за день
 * и с каким кодом. Период — в query-строке, см. useStatsPeriod.
 */
export function AccountStatsDashboard({
  accountId,
}: AccountStatsDashboardProps) {
  const [range, setRange] = useStatsPeriod();
  const query = useGetAccountStatsQuery(
    { accountId, from: range.from, to: range.to },
    { pollingInterval: POLLING_INTERVAL_MS },
  );
  // Приглушаем, только пока грузится другой период: фоновый опрос того же
  // периода не должен мигать всем дашбордом раз в минуту.
  const loadingOtherPeriod =
    query.isFetching && query.currentData === undefined;

  return (
    <Stack spacing={3}>
      <PeriodFilter range={range} onChange={setRange} />
      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить статистику"
        skeleton={<StatsSkeleton />}
      >
        {(stats) => (
          <Box
            sx={loadingOtherPeriod ? styles.refetching : undefined}
            aria-busy={loadingOtherPeriod}
          >
            <StatsContent stats={stats} />
          </Box>
        )}
      </QueryBoundary>
    </Stack>
  );
}

function StatsContent({ stats }: { stats: AccountStats }) {
  const model = useMemo(() => buildStatsSeries(stats), [stats]);

  return (
    <Stack spacing={2}>
      <StatsTiles stats={stats} model={model} />

      <SectionCard
        title="Новые диалоги по дням"
        subtitle="Первое входящее сообщение от собеседника, сгруппировано по коду из него"
      >
        <StackedColumnChart
          columns={model.columns}
          series={model.series}
          height={280}
          ariaLabel="Новые диалоги по дням с разбивкой по кодам"
        />
        <Box sx={styles.rule}>
          <InfoOutlinedIcon aria-hidden />
          <span>
            Диалог считается начатым по первому сообщению собеседника. Код ищем
            в нём по шаблонам «#1», «# 1», «Код 6», «код - 6», «код: 6» —
            регистр и знаки препинания не важны. Если совпадения нет, диалог
            попадает в «Без кода».
            {model.otherCodes.length > 0 &&
              ` В «Другие коды» свёрнуты: ${model.otherCodes.map((code) => `код ${code}`).join(', ')}.`}
          </span>
        </Box>
      </SectionCard>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <SectionCard
            title="Коды за период"
            subtitle="Сколько людей пришло с каждым кодом"
            fullHeight
          >
            <CodesTable stats={stats} model={model} />
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <SectionCard
            title="По дням"
            subtitle="Те же данные, что на графике, — таблицей"
            fullHeight
          >
            <DailyTable stats={stats} model={model} />
          </SectionCard>
        </Grid>
      </Grid>
    </Stack>
  );
}

function StatsSkeleton() {
  return (
    <Stack spacing={2} aria-busy aria-label="Загружаем статистику">
      <Grid container spacing={2}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Skeleton variant="rounded" height={112} />
          </Grid>
        ))}
      </Grid>
      <Skeleton variant="rounded" height={380} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Skeleton variant="rounded" height={300} />
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Skeleton variant="rounded" height={300} />
        </Grid>
      </Grid>
    </Stack>
  );
}
