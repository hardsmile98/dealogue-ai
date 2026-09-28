import type { KeyboardEvent } from 'react';
import Box from '@mui/material/Box';
import { CopyButton } from '../CopyButton/CopyButton';
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
  /** Закреплена кликом: принимает мышь, текст выделяется, есть копирование. */
  pinned: boolean;
  /** Escape внутри закреплённой подсказки. */
  onClose: () => void;
}

/**
 * Подсказка по столбцу: дата, итог и разбивка по сериям. Пока она идёт за
 * мышью, в неё не попасть — поэтому выделение и копирование только у
 * закреплённой.
 */
export function ChartTooltip({
  column,
  series,
  total,
  anchorX,
  chartWidth,
  pinned,
  onClose,
}: ChartTooltipProps) {
  const flip = anchorX > chartWidth - FLIP_ZONE_PX;
  const position = flip
    ? { right: chartWidth - anchorX + OFFSET_PX }
    : { left: anchorX + OFFSET_PX };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <Box
      sx={[styles.tooltip, pinned && styles.tooltipPinned, position]}
      // Фокусируемая: клик по тексту ставит фокус сюда, а не на <main>, и
      // график не принимает это выделение за уход фокуса.
      tabIndex={pinned ? -1 : undefined}
      onKeyDown={pinned ? handleKeyDown : undefined}
    >
      <Box sx={styles.tooltipHeader}>
        <Box sx={styles.tooltipTitle}>{column.title ?? column.label}</Box>
        {pinned && (
          <Box sx={styles.tooltipCopy}>
            <CopyButton
              text={formatSummary(column, series, total)}
              label="Скопировать цифры"
            />
          </Box>
        )}
      </Box>
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
      {!pinned && (
        <Box sx={styles.tooltipHint}>
          Нажмите, чтобы закрепить и скопировать
        </Box>
      )}
    </Box>
  );
}

/** Те же строки, что в подсказке, — «Всего: 20», «Код 2: 3»… — для вставки в чат. */
function formatSummary(
  column: ChartColumn,
  series: ChartSeries[],
  total: number,
): string {
  return [
    `Всего: ${total}`,
    ...series.map((s) => `${s.label}: ${column.values[s.key] ?? 0}`),
  ].join('\n');
}
