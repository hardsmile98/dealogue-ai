import type { ChartColumn, ChartSeries } from './types';

/** Поля вокруг области построения: слева подписи оси Y, снизу — оси X. */
export const MARGIN = { top: 12, right: 8, bottom: 28, left: 36 };

const MAX_BAR_WIDTH = 24;
const SEGMENT_GAP = 2;
const CORNER_RADIUS = 4;
/** Меньше этого расстояния подписи оси X налезают друг на друга. */
const MIN_LABEL_SPACING = 52;
/** Приглушение соседних столбцов, когда один подсвечен. */
export const DIMMED_OPACITY = 0.55;

export interface ChartLayout {
  plotWidth: number;
  plotHeight: number;
  /** Сумма по каждому столбцу. */
  totals: number[];
  maxTotal: number;
  /** Значения линий сетки по Y. */
  ticks: number[];
  /** Ширина полосы одного столбца. */
  band: number;
  barWidth: number;
  /** Подписывать каждый N-й столбец. */
  labelEvery: number;
  scaleY: (value: number) => number;
}

export interface BarSegment {
  key: string;
  color: string;
  /** SVG-path для верхнего (скруглённого) сегмента, иначе прямоугольник. */
  path: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** «Красивый» шаг сетки для максимума: 1, 2, 5, 10, 20, 50… */
export function niceStep(max: number, targetTicks = 4): number {
  if (max <= 0) return 1;
  const rough = max / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

/** Прямоугольник со скруглёнными верхними углами. */
export function topRoundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const radius = Math.min(r, h, w / 2);
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + w - radius}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `V${y + h}`,
    'Z',
  ].join(' ');
}

export function computeLayout(
  columns: ChartColumn[],
  series: ChartSeries[],
  width: number,
  height: number,
): ChartLayout {
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const totals = columns.map((column) =>
    series.reduce((sum, s) => sum + (column.values[s.key] ?? 0), 0),
  );
  const maxTotal = Math.max(0, ...totals);
  // На графике — количества: полдиалога на оси Y выглядят нелепо.
  const step = Math.max(1, niceStep(maxTotal));
  const yMax = Math.max(step, Math.ceil(maxTotal / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= yMax; value += step) ticks.push(value);

  const band = columns.length > 0 ? plotWidth / columns.length : 0;
  const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, band * 0.62));
  const labelEvery =
    band > 0 ? Math.max(1, Math.ceil(MIN_LABEL_SPACING / band)) : 1;

  return {
    plotWidth,
    plotHeight,
    totals,
    maxTotal,
    ticks,
    band,
    barWidth,
    labelEvery,
    scaleY: (value) => plotHeight - (value / yMax) * plotHeight,
  };
}

/**
 * Сегменты одного столбца снизу вверх. Нулевые серии пропускаются, между
 * сегментами — просвет цветом фона, а не обводка; скруглён только верхний.
 */
export function stackSegments(
  column: ChartColumn,
  index: number,
  series: ChartSeries[],
  layout: ChartLayout,
): BarSegment[] {
  const x = layout.band * index + (layout.band - layout.barWidth) / 2;
  const nonZero = series.filter((s) => (column.values[s.key] ?? 0) > 0);
  const segments: BarSegment[] = [];
  let cursor = 0;

  nonZero.forEach((s, segmentIndex) => {
    const value = column.values[s.key] ?? 0;
    const yTop = layout.scaleY(cursor + value);
    const yBottom = layout.scaleY(cursor);
    cursor += value;
    const gap = segmentIndex === 0 ? 0 : SEGMENT_GAP;
    const height = Math.max(0, yBottom - yTop - gap);
    if (height <= 0) return;
    const isTop = segmentIndex === nonZero.length - 1;
    segments.push({
      key: s.key,
      color: s.color,
      path: isTop
        ? topRoundedRect(x, yTop, layout.barWidth, height, CORNER_RADIUS)
        : null,
      x,
      y: yTop,
      width: layout.barWidth,
      height,
    });
  });

  return segments;
}

/** Подписывать ли столбец на оси X: каждый N-й, чтобы подписи не слипались. */
export function showsLabel(
  index: number,
  count: number,
  layout: ChartLayout,
): boolean {
  return (
    index % layout.labelEvery === 0 ||
    (index === count - 1 && layout.labelEvery === 1)
  );
}
