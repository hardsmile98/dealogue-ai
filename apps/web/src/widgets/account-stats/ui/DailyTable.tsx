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
  // Столбцы графика и дни ответа связаны ключом дня, а не порядком:
  // сортировка одного из них не должна разъезжаться с другим.
  const totalByDay = new Map(stats.days.map((day) => [day.date, day.total]))
  const seriesTotals = model.series.map((series) => ({
    key: series.key,
    total: model.columns.reduce((sum, column) => sum + (column.values[series.key] ?? 0), 0),
  }))

  return (
    <Box sx={styles.tableScroll}>
      <Table size="small" stickyHeader sx={styles.table}>
        <TableHead>
          <TableRow>
            <TableCell>Дата</TableCell>
            <TableCell align="right">Всего</TableCell>
            {model.series.map((series) => (
              <TableCell key={series.key} align="right">
                <Box sx={styles.headerWithSwatch}>
                  <Box sx={[styles.swatch, { bgcolor: series.color }]} />
                  {series.label}
                </Box>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {[...model.columns].reverse().map((column) => {
            const total = totalByDay.get(column.key) ?? 0
            return (
              <TableRow key={column.key} hover sx={total === 0 ? styles.emptyRow : undefined}>
                <TableCell sx={styles.dayCell}>
                  {formatWeekdayDayMonth(fromDayKey(column.key))}
                </TableCell>
                <TableCell align="right" sx={[styles.numberCell, styles.totalCell]}>
                  {formatNumber(total)}
                </TableCell>
                {model.series.map((series) => {
                  const value = column.values[series.key] ?? 0
                  return (
                    <TableCell key={series.key} align="right" sx={styles.numberCell}>
                      {value === 0 ? '·' : formatNumber(value)}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
          <TableRow sx={styles.totalRow}>
            <TableCell>Итого</TableCell>
            <TableCell align="right" sx={styles.numberCell}>
              {formatNumber(stats.totals.total)}
            </TableCell>
            {seriesTotals.map((series) => (
              <TableCell key={series.key} align="right" sx={styles.numberCell}>
                {formatNumber(series.total)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  )
}
