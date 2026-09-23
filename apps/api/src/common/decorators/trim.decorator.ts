import { Transform } from 'class-transformer';

/**
 * Обрезает пробелы у строкового поля до валидации — чтобы `IsNotEmpty`
 * отсекал и строку из одних пробелов, а сервис получал уже чистое значение.
 */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
