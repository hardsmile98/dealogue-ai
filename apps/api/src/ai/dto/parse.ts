import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Разбор тела запроса по zod-схеме; первая ошибка — в человеческом виде. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path.map(String).join('.');
  throw new BadRequestException(path ? `${path}: ${issue.message}` : (issue?.message ?? 'Неверные данные'));
}
