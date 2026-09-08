import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { stackedColumnChartStyles as styles } from './StackedColumnChart.styles'

export interface ChartSeries {
  key: string
  label: string
  color: string
}

export interface ChartColumn {
  key: string
  /** Подпись на оси X. */
  label: string
  /** Заголовок всплывающей подсказки; по умолчанию label. */
  title?: string
  values: Record<string, number>
}

interface StackedColumnChartProps {
  columns: ChartColumn[]
  series: ChartSeries[]
  /** Высота области построения без легенды, px. */
  height?: number
  emptyText?: string
  ariaLabel?: string
}

const MARGIN = { top: 12, right: 8, bottom: 28, left: 36 }
const MAX_BAR_WIDTH = 24
const SEGMENT_GAP = 2
const CORNER_RADIUS = 4
const MIN_LABEL_SPACING = 52

/** «Красивый» шаг сетки для максимума: 1, 2, 5, 10, 20, 50… */
function niceStep(max: number, targetTicks = 4): number {
  if (max <= 0) return 1
  const rough = max / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return factor * magnitude
}

function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, h, w / 2)
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + w - radius}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `V${y + h}`,
    'Z',
  ].join(' ')
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

/**
 * Столбчатый график с накоплением на чистом SVG: тонкие столбцы, 2px просветы
 * между сегментами, сетка-волосок, легенда и подсказка по столбцу (наведение
 * и фокус с клавиатуры). Значения также доступны без наведения — таблицей
 * рядом с графиком, это ответственность вызывающего.
 */
export function StackedColumnChart({
  columns,
  series,
  height = 260,
  emptyText = 'Нет данных за период',
  ariaLabel,
}: StackedColumnChartProps) {
  const theme = useTheme()
  const { ref, width } = useContainerWidth()
  const [hovered, setHovered] = useState<number | null>(null)

  const layout = useMemo(() => {
    const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
    const plotHeight = height - MARGIN.top - MARGIN.bottom
    const totals = columns.map((column) =>
      series.reduce((sum, s) => sum + (column.values[s.key] ?? 0), 0),
    )
    const maxTotal = Math.max(0, ...totals)
    const step = niceStep(maxTotal)
    const yMax = Math.max(step, Math.ceil(maxTotal / step) * step)
    const ticks: number[] = []
    for (let v = 0; v <= yMax; v += step) ticks.push(v)

    const band = columns.length > 0 ? plotWidth / columns.length : 0
    const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, band * 0.62))
    const labelEvery = band > 0 ? Math.max(1, Math.ceil(MIN_LABEL_SPACING / band)) : 1

    const scaleY = (value: number) => plotHeight - (value / yMax) * plotHeight

    return { plotWidth, plotHeight, totals, maxTotal, ticks, yMax, band, barWidth, labelEvery, scaleY }
  }, [columns, series, width, height])

  const isEmpty = layout.maxTotal === 0
  const gridColor = theme.palette.divider
  const axisColor = theme.palette.text.disabled
  const labelColor = theme.palette.text.secondary

  const hoveredColumn = hovered === null ? null : columns[hovered]
  const tooltipLeft =
    hovered === null
      ? 0
      : MARGIN.left + layout.band * hovered + layout.band / 2
  const tooltipFlip = tooltipLeft > width - 220

  return (
    <Box>
      {series.length > 1 && (
        <Box component="ul" sx={[styles.legend, { listStyle: 'none', p: 0, m: 0, mb: 2 }]}>
          {series.map((s) => (
            <Box component="li" key={s.key} sx={styles.legendItem}>
              <Box sx={[styles.legendSwatch, { bgcolor: s.color }]} />
              {s.label}
            </Box>
          ))}
        </Box>
      )}

      <Box ref={ref} sx={styles.root}>
        {width > 0 && (
          <Box
            component="svg"
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            sx={styles.svg}
            onMouseLeave={() => setHovered(null)}
          >
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {/* Сетка и подписи оси Y */}
              {layout.ticks.map((tick) => {
                const y = layout.scaleY(tick)
                return (
                  <g key={tick}>
                    <line
                      x1={0}
                      x2={layout.plotWidth}
                      y1={y}
                      y2={y}
                      stroke={tick === 0 ? axisColor : gridColor}
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                    />
                    <text
                      x={-8}
                      y={y}
                      dy="0.35em"
                      textAnchor="end"
                      fontSize={11}
                      fill={labelColor}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {tick}
                    </text>
                  </g>
                )
              })}

              {/* Подсветка наведённого столбца */}
              {hovered !== null && (
                <rect
                  x={layout.band * hovered}
                  y={0}
                  width={layout.band}
                  height={layout.plotHeight}
                  fill={theme.palette.action.hover}
                />
              )}

              {/* Столбцы */}
              {columns.map((column, index) => {
                const x = layout.band * index + (layout.band - layout.barWidth) / 2
                let cursor = 0
                const nonZero = series.filter((s) => (column.values[s.key] ?? 0) > 0)
                return (
                  <g key={column.key}>
                    {nonZero.map((s, segmentIndex) => {
                      const value = column.values[s.key] ?? 0
                      const yTop = layout.scaleY(cursor + value)
                      const yBottom = layout.scaleY(cursor)
                      cursor += value
                      const isTop = segmentIndex === nonZero.length - 1
                      // Просвет между сегментами — цветом поверхности, не обводкой.
                      const gap = segmentIndex === 0 ? 0 : SEGMENT_GAP
                      const h = Math.max(0, yBottom - yTop - gap)
                      if (h <= 0) return null
                      const dimmed = hovered !== null && hovered !== index
                      return isTop ? (
                        <path
                          key={s.key}
                          d={topRoundedRect(x, yTop, layout.barWidth, h, CORNER_RADIUS)}
                          fill={s.color}
                          opacity={dimmed ? 0.55 : 1}
                        />
                      ) : (
                        <rect
                          key={s.key}
                          x={x}
                          y={yTop}
                          width={layout.barWidth}
                          height={h}
                          fill={s.color}
                          opacity={dimmed ? 0.55 : 1}
                        />
                      )
                    })}
                  </g>
                )
              })}

              {/* Подписи оси X */}
              {columns.map((column, index) => {
                const show =
                  index % layout.labelEvery === 0 ||
                  (index === columns.length - 1 && layout.labelEvery === 1)
                if (!show) return null
                return (
                  <text
                    key={column.key}
                    x={layout.band * index + layout.band / 2}
                    y={layout.plotHeight + 18}
                    textAnchor="middle"
                    fontSize={11}
                    fill={labelColor}
                  >
                    {column.label}
                  </text>
                )
              })}

              {/* Зоны наведения: вся полоса столбца, а не только закрашенные пиксели */}
              {columns.map((column, index) => (
                <rect
                  key={column.key}
                  className="hit"
                  x={layout.band * index}
                  y={0}
                  width={layout.band}
                  height={layout.plotHeight}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${column.title ?? column.label}: ${layout.totals[index]}`}
                  onMouseEnter={() => setHovered(index)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                />
              ))}
            </g>
          </Box>
        )}

        {isEmpty && width > 0 && <Box sx={styles.empty}>{emptyText}</Box>}

        {hoveredColumn && hovered !== null && (
          <Box
            sx={[
              styles.tooltip,
              tooltipFlip
                ? { right: width - tooltipLeft + 12 }
                : { left: tooltipLeft + 12 },
            ]}
          >
            <Box sx={styles.tooltipTitle}>{hoveredColumn.title ?? hoveredColumn.label}</Box>
            <Box sx={styles.tooltipTotal}>
              <span>Всего</span>
              <span>{layout.totals[hovered]}</span>
            </Box>
            {series.map((s) => (
              <Box key={s.key} sx={styles.tooltipRow}>
                <Box sx={[styles.tooltipKey, { bgcolor: s.color }]} />
                <Box sx={styles.tooltipLabel}>{s.label}</Box>
                <Box sx={styles.tooltipValue}>{hoveredColumn.values[s.key] ?? 0}</Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
