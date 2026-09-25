import { DIMMED_OPACITY, stackSegments } from './chartLayout';
import type { ChartLayout } from './chartLayout';
import type { ChartColumn, ChartSeries } from './types';

interface ChartBarsProps {
  columns: ChartColumn[];
  series: ChartSeries[];
  layout: ChartLayout;
  /** Подсвеченный столбец; остальные приглушаются. */
  active: number | null;
}

/** Столбцы с накоплением: сегменты снизу вверх в порядке серий. */
export function ChartBars({ columns, series, layout, active }: ChartBarsProps) {
  return (
    <>
      {columns.map((column, index) => {
        const opacity =
          active !== null && active !== index ? DIMMED_OPACITY : 1;
        return (
          <g key={column.key} opacity={opacity}>
            {stackSegments(column, index, series, layout).map((segment) =>
              segment.path ? (
                <path key={segment.key} d={segment.path} fill={segment.color} />
              ) : (
                <rect
                  key={segment.key}
                  x={segment.x}
                  y={segment.y}
                  width={segment.width}
                  height={segment.height}
                  fill={segment.color}
                />
              ),
            )}
          </g>
        );
      })}
    </>
  );
}
