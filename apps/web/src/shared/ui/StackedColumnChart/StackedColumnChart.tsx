import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import { useElementWidth } from '@/shared/lib';
import { XAxisLabels, YAxisGrid } from './ChartAxes';
import { ChartBars } from './ChartBars';
import { MARGIN, computeLayout } from './chartLayout';
import { ChartLegend } from './ChartLegend';
import { ChartTooltip } from './ChartTooltip';
import { stackedColumnChartStyles as styles } from './StackedColumnChart.styles';
import type { ChartColumn, ChartSeries } from './types';

export type { ChartColumn, ChartSeries } from './types';

interface StackedColumnChartProps {
  columns: ChartColumn[];
  series: ChartSeries[];
  /** Высота области построения без легенды, px. */
  height?: number;
  emptyText?: string;
  ariaLabel?: string;
}

/**
 * Столбчатый график с накоплением на чистом SVG: тонкие столбцы, 2px просветы
 * между сегментами, сетка-волосок, легенда и подсказка по столбцу. Подсказка
 * открывается наведением или с клавиатуры: график — одна остановка Tab,
 * дальше стрелки влево и вправо. Значения также доступны без наведения —
 * таблицей рядом с графиком, это ответственность вызывающего.
 */
export function StackedColumnChart({
  columns,
  series,
  height = 260,
  emptyText = 'Нет данных за период',
  ariaLabel,
}: StackedColumnChartProps) {
  const theme = useTheme();
  const { ref, width } = useElementWidth();
  const [active, setActive] = useState<number | null>(null);

  const layout = useMemo(
    () => computeLayout(columns, series, width, height),
    [columns, series, width, height],
  );

  const activeColumn = active === null ? undefined : columns[active];
  const isEmpty = layout.maxTotal === 0;

  const handleKeyDown = (event: KeyboardEvent) => {
    const last = columns.length - 1;
    if (last < 0) return;
    const current = active ?? last;
    const next: Record<string, number> = {
      ArrowLeft: Math.max(0, current - 1),
      ArrowRight: Math.min(last, current + 1),
      Home: 0,
      End: last,
    };
    if (event.key in next) {
      event.preventDefault();
      setActive(next[event.key] ?? current);
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  };

  return (
    <Box>
      <ChartLegend series={series} />

      <Box ref={ref} sx={styles.root}>
        {width > 0 && (
          <Box
            component="svg"
            role="img"
            aria-label={
              ariaLabel
                ? `${ariaLabel}. Стрелки влево и вправо — по столбцам.`
                : undefined
            }
            tabIndex={columns.length > 0 ? 0 : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            sx={styles.svg}
            onMouseLeave={() => setActive(null)}
            // По умолчанию — самый свежий столбец: его чаще всего и ищут.
            onFocus={() => setActive((value) => value ?? columns.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={handleKeyDown}
          >
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              <YAxisGrid layout={layout} />

              {active !== null && (
                <rect
                  x={layout.band * active}
                  y={0}
                  width={layout.band}
                  height={layout.plotHeight}
                  fill={theme.palette.action.hover}
                />
              )}

              <ChartBars
                columns={columns}
                series={series}
                layout={layout}
                active={active}
              />
              <XAxisLabels columns={columns} layout={layout} />

              {/* Зоны наведения: вся полоса столбца, а не только закрашенные пиксели. */}
              {columns.map((column, index) => (
                <rect
                  key={column.key}
                  x={layout.band * index}
                  y={0}
                  width={layout.band}
                  height={layout.plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setActive(index)}
                />
              ))}
            </g>
          </Box>
        )}

        {isEmpty && width > 0 && <Box sx={styles.empty}>{emptyText}</Box>}

        {activeColumn && active !== null && (
          <ChartTooltip
            column={activeColumn}
            series={series}
            total={layout.totals[active] ?? 0}
            anchorX={MARGIN.left + layout.band * active + layout.band / 2}
            chartWidth={width}
          />
        )}

        {/* Экранному диктору — что сейчас выбрано стрелками. */}
        <Box aria-live="polite" sx={styles.visuallyHidden}>
          {activeColumn &&
            active !== null &&
            `${activeColumn.title ?? activeColumn.label}: всего ${layout.totals[active] ?? 0}`}
        </Box>
      </Box>
    </Box>
  );
}
