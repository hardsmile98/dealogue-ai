/** Текст ошибки для журнала и ответа: `message` у Error, иначе строка. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Для логов, где нужен стек: `stack` у Error (в нём уже есть `message`), иначе строка. */
export function errorDetail(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
