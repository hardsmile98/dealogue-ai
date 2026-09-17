import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { TelegramAccountsService } from '../telegram/services/telegram-accounts.service.js';
import { AiConfig } from './ai.config.js';
import { toSettingsDto } from './ai.types.js';
import type { AiProviderInfoDto, AiSettingsDto } from './ai.types.js';
import { updateSettingsSchema } from './dto/ai-settings.schema.js';
import type { CircuitBreaker } from './llm/circuit-breaker.js';
import { LlmProviderFactory } from './llm/llm-provider.factory.js';
import { AiSettingsService } from './services/ai-settings.service.js';

/** Настройки ИИ-агента одного аккаунта. */
@Controller('telegram/accounts/:id/ai')
@UseGuards(JwtAuthGuard)
export class AiSettingsController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly settings: AiSettingsService,
  ) {}

  @Get('settings')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<AiSettingsDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return toSettingsDto(await this.settings.get(accountId));
  }

  @Put('settings')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: unknown,
  ): Promise<AiSettingsDto> {
    await this.accounts.requireAccount(user.id, accountId);
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join('.');
      throw new BadRequestException(path ? `${path}: ${issue.message}` : (issue?.message ?? 'Неверные данные'));
    }
    return toSettingsDto(await this.settings.update(accountId, parsed.data, user.id));
  }
}

/** Справочники ИИ, не привязанные к аккаунту. */
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly config: AiConfig,
    private readonly providers: LlmProviderFactory,
  ) {}

  @Get('providers')
  list(): { providers: AiProviderInfoDto[]; defaultModel: string } {
    return {
      providers: this.providers.describe().map((p) => ({
        name: p.name,
        models: p.models,
        configured: p.configured,
        isDefault: p.name === this.config.provider,
      })),
      defaultModel: this.config.model,
    };
  }

  @Get('health')
  health(): {
    enabled: boolean;
    ready: boolean;
    provider: string;
    model: string;
    breakers: Record<string, CircuitBreaker['state']>;
  } {
    const breakers: Record<string, CircuitBreaker['state']> = {};
    for (const p of this.providers.describe()) breakers[p.name] = p.breaker;
    return {
      enabled: this.config.enabled,
      ready: this.config.ready,
      provider: this.config.provider,
      model: this.config.model,
      breakers,
    };
  }
}
