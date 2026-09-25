import { useTheme } from '@mui/material/styles';
import { showsLabel } from './chartLayout';
import type { ChartLayout } from './chartLayout';
import type { ChartColumn } from './types';

const AXIS_FONT_SIZE = 11;

/** Горизонтальная сетка-волосок и подписи оси Y. */
export function YAxisGrid({ layout }: { layout: ChartLayout }) {
  const { palette } = useTheme();

  return (
    <>
      {layout.ticks.map((tick) => {
        const y = layout.scaleY(tick);
        return (
          <g key={tick}>
            <line
              x1={0}
              x2={layout.plotWidth}
              y1={y}
              y2={y}
              stroke={tick === 0 ? palette.text.disabled : palette.divider}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={-8}
              y={y}
              dy="0.35em"
              textAnchor="end"
              fontSize={AXIS_FONT_SIZE}
              fill={palette.text.secondary}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {tick}
            </text>
          </g>
        );
      })}
    </>
  );
}

interface XAxisLabelsProps {
  columns: ChartColumn[];
  layout: ChartLayout;
}

/** Подписи оси X — каждый N-й столбец, чтобы не слипались. */
export function XAxisLabels({ columns, layout }: XAxisLabelsProps) {
  const { palette } = useTheme();

  return (
    <>
      {columns.map((column, index) =>
        showsLabel(index, columns.length, layout) ? (
          <text
            key={column.key}
            x={layout.band * index + layout.band / 2}
            y={layout.plotHeight + 18}
            textAnchor="middle"
            fontSize={AXIS_FONT_SIZE}
            fill={palette.text.secondary}
          >
            {column.label}
          </text>
        ) : null,
      )}
    </>
  );
}
