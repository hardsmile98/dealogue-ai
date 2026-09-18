import { z } from 'zod';

/** Период статистики: даты в таймзоне аккаунта, по умолчанию — последние 7 дней. */
export const statsQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается YYYY-MM-DD').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ожидается YYYY-MM-DD').optional(),
  })
  .strict();
export type StatsQueryInput = z.infer<typeof statsQuerySchema>;
