import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_PERIOD, isDayKey, presetRange } from '../lib/period';
import type { DateRange } from '../lib/period';

/**
 * Период статистики живёт в query-строке (`?from=&to=`), чтобы ссылку можно
 * было переслать коллеге. Битые или перепутанные даты — период по умолчанию.
 */
export function useStatsPeriod(): [DateRange, (next: DateRange) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const range = useMemo<DateRange>(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (isDayKey(from) && isDayKey(to) && from <= to) return { from, to };
    return presetRange(DEFAULT_PERIOD);
  }, [searchParams]);

  const setRange = useCallback(
    (next: DateRange) =>
      setSearchParams(
        (params) => {
          params.set('from', next.from);
          params.set('to', next.to);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return [range, setRange];
}
