import { useCallback, useState } from 'react';

export interface Draft<T> {
  draft: T;
  setDraft: (next: T | ((current: T) => T)) => void;
  /** Черновик отличается от значения с сервера. */
  dirty: boolean;
  /** Отбросить правки и вернуться к значению с сервера. */
  reset: () => void;
}

/**
 * Черновик формы поверх значения с сервера.
 *
 * Сервер прислал новое значение (после сохранения или перезапроса) —
 * черновик подхватывает его без перемонтирования формы. Сравнение по JSON:
 * RTK Query после перезапроса отдаёт новый объект, даже если данные те же,
 * и незачем из-за этого сбрасывать правки пользователя.
 */
export function useDraft<T>(source: T): Draft<T> {
  const sourceJson = JSON.stringify(source);
  const [draft, setDraft] = useState<T>(source);
  const [syncedJson, setSyncedJson] = useState(sourceJson);

  if (syncedJson !== sourceJson) {
    setSyncedJson(sourceJson);
    setDraft(source);
  }

  const reset = useCallback(
    () => setDraft(JSON.parse(sourceJson) as T),
    [sourceJson],
  );

  return {
    draft,
    setDraft,
    dirty: JSON.stringify(draft) !== sourceJson,
    reset,
  };
}
