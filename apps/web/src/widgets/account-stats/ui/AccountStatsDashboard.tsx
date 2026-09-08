import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { formatNumber, formatShare, getApiErrorMessage, pluralize } from '@/shared/lib'
import { StackedColumnChart, StatTile } from '@/shared/ui'
import { useGetAccountStatsQuery } from '@/entities/telegram-account'
import { NO_CODE_KEY, buildStatsSeries, percentDelta } from '../lib/buildSeries'
import { DEFAULT_PERIOD, isDayKey, presetRange } from '../lib/period'
import type { DateRange } from '../lib/period'
import { accountStatsStyles as styles } from './AccountStats.styles'
import { CodesTable } from './CodesTable'
import { DailyTable } from './DailyTable'
import { PeriodFilter } from './PeriodFilter'

interface AccountStatsDashboardProps {
  accountId: string
}

/**
 * Статистика первых сообщений: сколько людей написали впервые за день
 * и с каким кодом. Период живёт в query-строке (?from=&to=), чтобы ссылку
 * можно было переслать коллеге.
 */
export function AccountStatsDashboard({ accountId }: AccountStatsDashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams()

  const range = useMemo<DateRange>(() => {
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (isDayKey(from) && isDayKey(to) && from <= to) return { from, to }
    return presetRange(DEFAULT_PERIOD)
  }, [searchParams])

  const setRange = (next: DateRange) => {
    setSearchParams(
      (params) => {
        params.set('from', next.from)
        params.set('to', next.to)
        return params
      },
      { replace: true },
    )
  }

  const { data: stats, isLoading, isFetching, error } = useGetAccountStatsQuery(
    { accountId, from: range.from, to: range.to },
    { pollingInterval: 60_000 },
  )

  const model = useMemo(() => (stats ? buildStatsSeries(stats) : null), [stats])

  const periodDays = stats?.days.length ?? 7
  const versusLabel =
    periodDays === 1
      ? 'к предыдущему дню'
      : `к прошлым ${pluralize(periodDays, ['дню', 'дням', 'дням'])}`
  const topCode = stats?.codes[0] ?? null

  return (
    <Box>
      <Box sx={styles.filters}>
        <PeriodFilter range={range} onChange={setRange} />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {getApiErrorMessage(error, 'Не удалось загрузить статистику')}
        </Alert>
      )}

      {isLoading || !stats || !model ? (
        <StatsSkeleton />
      ) : (
        <Box sx={isFetching ? styles.refetching : undefined}>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatTile
                label="Новых диалогов"
                value={formatNumber(stats.totals.total)}
                delta={{
                  percent: percentDelta(stats.totals.total, stats.previousTotals.total),
                  versus: versusLabel,
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatTile
                label="С кодом"
                value={formatNumber(stats.totals.withCode)}
                caption={`${formatShare(stats.totals.withCode, stats.totals.total)} от всех новых диалогов`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatTile
                label="Без кода"
                value={formatNumber(stats.totals.withoutCode)}
                caption={`${formatShare(stats.totals.withoutCode, stats.totals.total)} от всех новых диалогов`}
                swatchColor={model.colorByKey[NO_CODE_KEY]}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <StatTile
                label="Самый частый код"
                value={topCode ? `Код ${topCode.code}` : '—'}
                caption={
                  topCode
                    ? `${pluralize(topCode.count, ['диалог', 'диалога', 'диалогов'])} · ${formatShare(topCode.count, stats.totals.total)}`
                    : 'Кодов за период не было'
                }
                swatchColor={topCode ? model.colorByKey[topCode.code] : undefined}
              />
            </Grid>
          </Grid>

          <Paper elevation={0} sx={[styles.card, { mb: 2 }]}>
            <Typography sx={styles.cardTitle}>Новые диалоги по дням</Typography>
            <Typography sx={styles.cardSubtitle}>
              Первое входящее сообщение от собеседника, сгруппировано по коду из него
            </Typography>
            <StackedColumnChart
              columns={model.columns}
              series={model.series}
              height={280}
              ariaLabel="Новые диалоги по дням с разбивкой по кодам"
            />
            <Box sx={styles.rule}>
              <InfoOutlinedIcon />
              <span>
                Диалог считается начатым по первому сообщению собеседника. Код ищем
                в нём по шаблонам «#1», «# 1», «Код 6», «код - 6», «код: 6» — регистр
                и знаки препинания не важны. Если совпадения нет, диалог попадает в
                «Без кода».
                {model.otherCodes.length > 0 &&
                  ` В «Другие коды» свёрнуты: ${model.otherCodes.map((c) => `код ${c}`).join(', ')}.`}
              </span>
            </Box>
          </Paper>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 5 }}>
              <Paper elevation={0} sx={styles.card}>
                <Typography sx={styles.cardTitle}>Коды за период</Typography>
                <Typography sx={styles.cardSubtitle}>
                  Сколько людей пришло с каждым кодом
                </Typography>
                <CodesTable stats={stats} model={model} />
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, lg: 7 }}>
              <Paper elevation={0} sx={styles.card}>
                <Typography sx={styles.cardTitle}>По дням</Typography>
                <Typography sx={styles.cardSubtitle}>
                  Те же данные, что на графике, — таблицей
                </Typography>
                <DailyTable stats={stats} model={model} />
              </Paper>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  )
}

function StatsSkeleton() {
  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Skeleton variant="rounded" height={112} sx={{ borderRadius: 3 }} />
          </Grid>
        ))}
      </Grid>
      <Skeleton variant="rounded" height={380} sx={{ borderRadius: 3, mb: 2 }} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Skeleton variant="rounded" height={300} sx={{ borderRadius: 3 }} />
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Skeleton variant="rounded" height={300} sx={{ borderRadius: 3 }} />
        </Grid>
      </Grid>
    </Box>
  )
}
