import type { AiSettingsDto } from '../settings/ai-settings.types.js';

/**
 * Итог сброса наружу — зеркало apps/web/src/shared/api/contracts/ai/settings.ts.
 * Менять синхронно.
 */

/** Сколько строк снёс сброс — по разделам, чтобы веб показал отчёт. */
export interface AiResetCountsDto {
  phrases: number;
  facts: number;
  diagnostics: number;
  categories: number;
  notes: number;
  playbooks: number;
  chatStates: number;
  turns: number;
  drafts: number;
  events: number;
  jobs: number;
  stats: number;
  alerts: number;
}

export interface AiResetResultDto {
  settings: AiSettingsDto;
  deleted: AiResetCountsDto;
}
