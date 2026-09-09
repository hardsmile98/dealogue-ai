import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Скалярные поля проверяет class-validator; `script`, `followups`,
 * `workingHours`, `overrides` — zod внутри сервиса (там схема богаче).
 */
export class UpdateAiSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(32)
  provider?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(64)
  model?: string | null;

  @IsOptional()
  @IsObject()
  script?: Record<string, unknown>;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  workingHours?: Record<string, unknown> | null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  debounceSec?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(3600)
  replyDelayCapSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxAiMessagesPerChat?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  maxAiMessagesPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(100)
  contextMessages?: number;

  @IsOptional()
  @IsBoolean()
  pauseOnHandoff?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyTelegram?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(128)
  handoffPeer?: string | null;

  @IsOptional()
  @IsBoolean()
  markRead?: boolean;

  @IsOptional()
  @IsBoolean()
  followupsEnabled?: boolean;

  @IsOptional()
  @IsArray()
  followups?: unknown[];

  @IsOptional()
  @IsBoolean()
  useLearnedStyle?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  retrievalExamples?: number;
}

export class UpdateOverridesDto {
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  overrides: Record<string, unknown> | null;
}

export class SetChatAiDto {
  @IsBoolean()
  enabled: boolean;
}

export class TestGenerateDto {
  @IsOptional()
  @IsObject()
  scriptOverride?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9)
  followupStep?: number;
}

export class RunsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
