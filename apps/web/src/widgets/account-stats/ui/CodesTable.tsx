import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { formatNumber, formatShare } from '@/shared/lib'
import type { AccountStats } from '@/entities/telegram-account'
import { NO_CODE_KEY, OTHER_CODES_KEY } from '../lib/buildSeries'
import type { StatsSeriesModel } from '../lib/buildSeries'
import { accountStatsStyles as styles } from './AccountStats.styles'

interface CodesTableProps {
  stats: AccountStats
  model: StatsSeriesModel
}

/** Разбивка по кодам за период: доля от всех новых диалогов. */
export function CodesTable({ stats, model }: CodesTableProps) {
  const total = stats.totals.total
  const max = Math.max(stats.totals.withoutCode, ...stats.codes.map((c) => c.count), 1)

  const rows = [
    ...stats.codes.map((entry) => ({
      key: entry.code,
      label: `Код ${entry.code}`,
      count: entry.count,
      color: model.colorByKey[entry.code] ?? model.colorByKey[OTHER_CODES_KEY],
    })),
    {
      key: NO_CODE_KEY,
      label: 'Без кода',
      count: stats.totals.withoutCode,
      color: model.colorByKey[NO_CODE_KEY],
    },
  ]

  if (total === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        За выбранный период новых диалогов не было.
      </Typography>
    )
  }

  return (
    <Table size="small" sx={styles.table}>
      <TableHead>
        <TableRow>
          <TableCell>Код</TableCell>
          <TableCell align="right">Диалогов</TableCell>
          <TableCell sx={{ width: '45%' }}>Доля</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} hover>
            <TableCell>
              <Box sx={styles.codeCell}>
                <Box sx={[styles.swatch, { bgcolor: row.color }]} />
                {row.label}
              </Box>
            </TableCell>
            <TableCell align="right" sx={styles.numberCell}>
              {formatNumber(row.count)}
            </TableCell>
            <TableCell>
              <Box sx={styles.shareCell}>
                <Box sx={styles.shareTrack}>
                  <Box
                    sx={[
                      styles.shareFill,
                      { width: `${(row.count / max) * 100}%`, bgcolor: row.color },
                    ]}
                  />
                </Box>
                <Box sx={styles.shareValue}>{formatShare(row.count, total)}</Box>
              </Box>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
