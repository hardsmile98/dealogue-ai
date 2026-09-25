import { useCallback, useState } from 'react';

/**
 * useState, который переживает перезагрузку и перемонтирование: значение
 * лежит в localStorage под `key`. Для настроек вида — свёрнута ли панель.
 * Если хранилище недоступно (приватный режим), работает как обычный useState.
 */
export function useStoredState<T>(
  key: string,
  initial: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Не сохранилось — значение живёт до перезагрузки.
      }
    },
    [key],
  );

  return [value, update];
}
