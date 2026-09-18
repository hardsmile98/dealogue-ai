import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Разбор тела/строки запроса по zod-схеме. Единственная точка, где zod
 * превращается в 400: сообщение собирается по первой ошибке, чтобы в вебе
 * показать одну понятную строку, а не список.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    // Пустое тело express отдаёт как undefined — схемы ждут объект.
    return parseOrThrow(this.schema, value ?? {});
  }
}

/** Схема → пайп. Короткая форма для `@Body(zod(schema))`. */
export function zod<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}

/** Разбор вне контроллера (например, уже полученного payload'а). */
export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path.map(String).join('.');
  throw new BadRequestException(path ? `${path}: ${issue.message}` : (issue?.message ?? 'Неверные данные'));
}
