import Box from '@mui/material/Box';
import type { ChartColumn, ChartSeries } from './types';
import { stackedColumnChartStyles as styles } from './StackedColumnChart.styles';

/** Ширина, при которой подсказка у правого края переворачивается влево. */
const FLIP_ZONE_PX = 220;
const OFFSET_PX = 12;

interface ChartTooltipProps {
  column: ChartColumn;
  series: ChartSeries[];
  total: number;
  /** Центр столбца по X внутри графика. */
  anchorX: number;
  /** Ширина графика — чтобы подсказка не вылезала за правый край. */
  chartWidth: number;
}

/** Подсказка по столбцу: дата, итог и разбивка по сериям. */
export function ChartTooltip({
  column,
  series,
  total,
  anchorX,
  chartWidth,
}: ChartTooltipProps) {
  const flip = anchorX > chartWidth - FLIP_ZONE_PX;
  const position = flip
    ? { right: chartWidth - anchorX + OFFSET_PX }
    : { left: anchorX + OFFSET_PX };

  return (
    <Box sx={[styles.tooltip, position]}>
      <Box sx={styles.tooltipTitle}>{column.title ?? column.label}</Box>
      <Box sx={styles.tooltipTotal}>
        <span>Всего</span>
        <span>{total}</span>
      </Box>
      {series.map((s) => (
        <Box key={s.key} sx={styles.tooltipRow}>
          <Box sx={[styles.tooltipKey, { bgcolor: s.color }]} />
          <Box sx={styles.tooltipLabel}>{s.label}</Box>
          <Box sx={styles.tooltipValue}>{column.values[s.key] ?? 0}</Box>
        </Box>
      ))}
    </Box>
  );
}
