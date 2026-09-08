import type {
  AccountStatsDto,
  CodeStatsDto,
  DailyStatsDto,
  StatsTotalsDto,
  TelegramAccountDto,
  TelegramAccountStatus,
} from '@/shared/api'

/** Доменные типы совпадают с DTO: маппинга пока нет, но точка расширения — здесь. */
export type TelegramAccount = TelegramAccountDto
export type AccountStatus = TelegramAccountStatus
export type AccountStats = AccountStatsDto
export type DailyStats = DailyStatsDto
export type CodeStats = CodeStatsDto
export type StatsTotals = StatsTotalsDto
