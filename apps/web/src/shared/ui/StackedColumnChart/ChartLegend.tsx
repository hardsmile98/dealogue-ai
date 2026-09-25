import Box from '@mui/material/Box';
import type { ChartSeries } from './types';
import { stackedColumnChartStyles as styles } from './StackedColumnChart.styles';

/** Легенда: цвет и подпись каждой серии. Для одной серии не нужна. */
export function ChartLegend({ series }: { series: ChartSeries[] }) {
  if (series.length < 2) return null;

  return (
    <Box component="ul" sx={styles.legend}>
      {series.map((s) => (
        <Box component="li" key={s.key} sx={styles.legendItem}>
          <Box sx={[styles.legendSwatch, { bgcolor: s.color }]} />
          {s.label}
        </Box>
      ))}
    </Box>
  );
}
