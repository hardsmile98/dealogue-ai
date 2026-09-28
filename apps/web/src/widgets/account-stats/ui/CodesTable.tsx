import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { formatNumber, formatShare } from '@/shared/lib';
import type { AccountStats } from '@/entities/telegram-account';
import { NO_CODE_KEY, OTHER_CODES_KEY } from '../lib/buildSeries';
import type { StatsSeriesModel } from '../lib/buildSeries';
import { accountStatsStyles as styles } from './AccountStats.styles';

interface CodesTableProps {
  stats: AccountStats;
  model: StatsSeriesModel;
}

/**
 * Разбивка по кодам за период: доля от всех новых диалогов. Коды,
 * свёрнутые на графике в «Остальные», и здесь идут одной строкой.
 */
export function CodesTable({ stats, model }: CodesTableProps) {
  const total = stats.totals.total;
  const other = new Set(model.otherCodes);
  const shownCodes = stats.codes.filter((entry) => !other.has(entry.code));
  const otherCount = stats.codes
    .filter((entry) => other.has(entry.code))
    .reduce((sum, entry) => sum + entry.count, 0);

  const rows = [
    ...shownCodes.map((entry) => ({
      key: entry.code,
      label: `Код ${entry.code}`,
      count: entry.count,
      color: model.colorByKey[entry.code],
    })),
    ...(other.size > 0
      ? [
          {
            key: OTHER_CODES_KEY,
            label: 'Остальные коды',
            count: otherCount,
            color: model.colorByKey[OTHER_CODES_KEY],
          },
        ]
      : []),
    {
      key: NO_CODE_KEY,
      label: 'Без кода',
      count: stats.totals.withoutCode,
      color: model.colorByKey[NO_CODE_KEY],
    },
  ];
  const max = Math.max(...rows.map((row) => row.count), 1);

  if (total === 0) {
    return (
      <Typography variant="body2" sx={styles.empty}>
        За выбранный период новых диалогов не было.
      </Typography>
    );
  }

  return (
    <Table size="small" sx={styles.table}>
      <TableHead>
        <TableRow>
          <TableCell>Код</TableCell>
          <TableCell align="right">Диалогов</TableCell>
          <TableCell sx={styles.shareHead}>Доля</TableCell>
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
                      {
                        width: `${(row.count / max) * 100}%`,
                        bgcolor: row.color,
                      },
                    ]}
                  />
                </Box>
                <Box sx={styles.shareValue}>
                  {formatShare(row.count, total)}
                </Box>
              </Box>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
