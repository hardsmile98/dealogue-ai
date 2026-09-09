import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { TelegramAccountsService } from '../telegram/services/telegram-accounts.service.js';
import { AiConfig } from './ai.config.js';
import { toJobDto, toProfileDto, toSettingsDto } from './ai.types.js';
import type { AiProviderInfoDto, AiSettingsDto, LearningStatusDto, StyleProfileDto } from './ai.types.js';
import { UpdateAiSettingsDto, UpdateOverridesDto } from './dto/ai.dto.js';
import { HistoryImportService } from './learning/history-import.service.js';
import { StyleLearningService } from './learning/style-learning.service.js';
import { StyleProfileSchema } from './learning/style-profile.schema.js';
import { LlmProviderFactory } from './llm/llm-provider.factory.js';
import { AiJobsService } from './services/ai-jobs.service.js';
import { AiSettingsService } from './services/ai-settings.service.js';

/** Настройки и обучение ИИ-агента на уровне аккаунта. */
@Controller('telegram/accounts/:id/ai')
@UseGuards(JwtAuthGuard)
export class AiAccountController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly settings: AiSettingsService,
    private readonly jobs: AiJobsService,
    private readonly importer: HistoryImportService,
    private readonly learning: StyleLearningService,
  ) {}

  @Get('settings')
  async getSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<AiSettingsDto> {
    await this.accounts.requireAccount(user.id, accountId);
    const row = await this.settings.getOrCreate(accountId);
    return toSettingsDto(row, this.settings.effectiveScript(row), this.settings.effectiveFollowups(row));
  }

  @Put('settings')
  async updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() dto: UpdateAiSettingsDto,
  ): Promise<AiSettingsDto> {
    await this.accounts.requireAccount(user.id, accountId);
    const row = await this.settings.update(accountId, dto);
    return toSettingsDto(row, this.settings.effectiveScript(row), this.settings.effectiveFollowups(row));
  }

  @Get('learning')
  async learningStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<LearningStatusDto> {
    const account = await this.accounts.requireAccount(user.id, accountId);
    const [importJob, digestJob, profile] = await Promise.all([
      this.jobs.findLatest(accountId, 'import'),
      this.jobs.findLatest(accountId, 'digest'),
      this.settings.getProfile(accountId),
    ]);
    const estimate = profile.status === 'building' ? null : await this.learning.estimate(accountId).catch(() => null);
    return {
      deepHistoryStatus: account.deepHistoryStatus,
      importJob: importJob ? toJobDto(importJob) : null,
      digestJob: digestJob ? toJobDto(digestJob) : null,
      profile: this.profileDto(profile),
      estimate,
    };
  }

  @Post('import')
  @HttpCode(HttpStatus.ACCEPTED)
  async startImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<{ started: true }> {
    await this.accounts.requireAccount(user.id, accountId);
    await this.importer.start(accountId);
    return { started: true };
  }

  @Post('learn')
  @HttpCode(HttpStatus.ACCEPTED)
  async startLearning(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<{ started: true }> {
    await this.accounts.requireAccount(user.id, accountId);
    await this.learning.start(accountId);
    return { started: true };
  }

  @Post('learn/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelLearning(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<{ cancelled: true }> {
    await this.accounts.requireAccount(user.id, accountId);
    await this.learning.cancel(accountId);
    await this.jobs.cancel('import', accountId);
    return { cancelled: true };
  }

  @Get('profile')
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<StyleProfileDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.profileDto(await this.settings.getProfile(accountId));
  }

  @Put('profile/overrides')
  async updateOverrides(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() dto: UpdateOverridesDto,
  ): Promise<StyleProfileDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.profileDto(await this.settings.updateOverrides(accountId, dto.overrides));
  }

  private profileDto(row: Parameters<typeof toProfileDto>[0]): StyleProfileDto {
    const parsed = StyleProfileSchema.safeParse(row.profile ?? {});
    const profile = parsed.success ? parsed.data : StyleProfileSchema.parse({});
    return toProfileDto(row, this.settings.effectiveProfile(row), profile);
  }
}

/** Общие справочники ИИ-раздела. */
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly config: AiConfig,
    private readonly providers: LlmProviderFactory,
  ) {}

  @Get('providers')
  listProviders(): { providers: AiProviderInfoDto[]; defaultModel: string; enabled: boolean } {
    return {
      providers: this.providers.describe().map((p) => ({
        name: p.name,
        models: p.models,
        configured: p.configured,
        isDefault: p.name === this.config.provider,
      })),
      defaultModel: this.config.model,
      enabled: this.config.enabled,
    };
  }
}
