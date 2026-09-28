import { useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent, Ref, RefObject } from 'react';
import Box from '@mui/material/Box';
import Popper from '@mui/material/Popper';
import type { PopperProps } from '@mui/material/Popper';
import { CopyButton } from '../CopyButton/CopyButton';
import type { ChartColumn, ChartSeries } from './types';
import { stackedColumnChartStyles as styles } from './StackedColumnChart.styles';

/** Ширина, при которой подсказка у правого края переворачивается влево. */
const FLIP_ZONE_PX = 220;
/** Отступ от центра столбца по горизонтали и от верха графика по вертикали. */
const OFFSET_PX = 12;
const TOP_PX = 8;

/**
 * Подсказка не должна выходить за край окна: если внизу не хватает места,
 * она поднимается, у края экрана — сдвигается вбок, но не отрывается от
 * графика, когда тот уезжает за экран при прокрутке. Влево подсказка
 * переворачивается у правого края графика, а не окна, — встроенный flip
 * выключен.
 */
const MODIFIERS: PopperProps['modifiers'] = [
  { name: 'offset', options: { offset: [TOP_PX, OFFSET_PX] } },
  { name: 'flip', enabled: false },
  {
    name: 'preventOverflow',
    // MUI при disablePortal ставит altBoundary: true — тогда границей
    // становится карточка вокруг графика, и подсказка в неё втискивается.
    options: { padding: 8, altAxis: true, altBoundary: false },
  },
];

/**
 * fixed вместо absolute: карточка вокруг графика обрезает всё, что выходит
 * за её границы, а высокая подсказка (много серий) выходит. Портал не нужен —
 * подсказка остаётся рядом с графиком в DOM, и Tab из графика попадает в неё.
 */
const POPPER_OPTIONS: PopperProps['popperOptions'] = { strategy: 'fixed' };

/** Экземпляр popper.js — тип берём из пропсов MUI, а не из транзитивного пакета. */
type PopperInstance =
  NonNullable<PopperProps['popperRef']> extends Ref<infer T> ? T : never;

interface ChartTooltipProps {
  column: ChartColumn;
  series: ChartSeries[];
  total: number;
  /** Центр столбца по X внутри графика. */
  anchorX: number;
  /** Ширина графика — чтобы подсказка не вылезала за правый край. */
  chartWidth: number;
  /** SVG графика: от его положения на экране считается привязка. */
  chartRef: RefObject<SVGSVGElement | null>;
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
  chartRef,
  pinned,
  onClose,
}: ChartTooltipProps) {
  const flip = anchorX > chartWidth - FLIP_ZONE_PX;
  // Точка привязки — центр столбца по X, весь график по высоте. SVG читается
  // только когда popper считает положение (не во время рендера), поэтому
  // при прокрутке подсказка едет вместе с графиком.
  const anchor = useMemo<PopperProps['anchorEl']>(
    () => ({
      // По нему popper находит прокручиваемых предков и следит за прокруткой.
      get contextElement() {
        return chartRef.current ?? undefined;
      },
      getBoundingClientRect: () => {
        const rect = chartRef.current?.getBoundingClientRect() ?? new DOMRect();
        return new DOMRect(rect.left + anchorX, rect.top, 0, rect.height);
      },
    }),
    [anchorX, chartRef],
  );
  const popperRef = useRef<PopperInstance>(null);

  // При закреплении меняется высота (подпись снизу уходит, кнопка
  // появляется) — пересчитываем положение, иначе у края окна подсказка
  // останется там, где стояла до этого.
  useEffect(() => {
    void popperRef.current?.update();
  }, [pinned, column, series]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <Popper
      open
      anchorEl={anchor}
      placement={flip ? 'left-start' : 'right-start'}
      disablePortal
      popperOptions={POPPER_OPTIONS}
      modifiers={MODIFIERS}
      popperRef={popperRef}
      sx={[styles.tooltipLayer, pinned && styles.tooltipLayerPinned]}
    >
      <Box
        sx={[styles.tooltip, pinned && styles.tooltipPinned]}
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
    </Popper>
  );
}

/**
 * Строки подсказки для вставки в чат — «Всего: 20», «Код 2: 3»… Серии
 * с нулём пропускаем: в переписке они только удлиняют список.
 */
function formatSummary(
  column: ChartColumn,
  series: ChartSeries[],
  total: number,
): string {
  return [
    `Всего: ${total}`,
    ...series
      .filter((s) => (column.values[s.key] ?? 0) > 0)
      .map((s) => `${s.label}: ${column.values[s.key]}`),
  ].join('\n');
}
