import { useEffect } from 'react';
import { APP_NAME } from '@/shared/config';

/**
 * Заголовок вкладки браузера: «Чаты · Jakara — Dealogue AI». Без него все
 * открытые вкладки приложения назывались одинаково. Пока `title` пустой
 * (данные грузятся), заголовок не трогаем.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} — ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
