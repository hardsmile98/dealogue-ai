import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { formatNumber, formatWeekdayDayMonth, fromDayKey } from '@/shared/lib'
import type { AccountStats } from '@/entities/telegram-account'
import type { StatsSeriesModel } from '../lib/buildSeries'
import { accountStatsStyles as styles } from './AccountStats.styles'

interface DailyTableProps {
  stats: AccountStats
  model: StatsSeriesModel
}

/** Табличный двойник графика: те же дни и серии, читается без наведения. */
export function DailyTable({ stats, model }: DailyTableProps) {
  const totalsByKey = model.series.map((s) =>
    model.columns.reduce((sum, column) => sum + (column.values[s.key] ?? 0), 0),
  )

  return (
    <Box sx={styles.tableScroll}>
      <Table size="small" stickyHeader sx={styles.table}>
        <TableHead>
          <TableRow>
            <TableCell>Дата</TableCell>
            <TableCell align="right">Всего</TableCell>
            {model.series.map((s) => (
              <TableCell key={s.key} align="right">
                <Box sx={styles.headerWithSwatch}>
                  <Box sx={[styles.swatch, { bgcolor: s.color }]} />
                  {s.label}
                </Box>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {[...model.columns].reverse().map((column, index) => {
            const day = stats.days[stats.days.length - 1 - index]
            const isEmpty = day.total === 0
            return (
              <TableRow key={column.key} hover sx={isEmpty ? styles.emptyRow : undefined}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {formatWeekdayDayMonth(fromDayKey(column.key))}
                </TableCell>
                <TableCell align="right" sx={[styles.numberCell, { fontWeight: 600 }]}>
                  {formatNumber(day.total)}
                </TableCell>
                {model.series.map((s) => (
                  <TableCell key={s.key} align="right" sx={styles.numberCell}>
                    {column.values[s.key] ? formatNumber(column.values[s.key]) : '·'}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
          <TableRow sx={styles.totalRow}>
            <TableCell>Итого</TableCell>
            <TableCell align="right" sx={styles.numberCell}>
              {formatNumber(stats.totals.total)}
            </TableCell>
            {totalsByKey.map((value, index) => (
              <TableCell key={model.series[index].key} align="right" sx={styles.numberCell}>
                {formatNumber(value)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  )
}
