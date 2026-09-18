import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { zod } from '../../common/pipes/zod-validation.pipe.js';
import { AccountId } from '../../telegram/decorators/account.decorator.js';
import { AccountAccessGuard } from '../../telegram/guards/account-access.guard.js';
import { updateSettingsSchema } from './ai-settings.schema.js';
import type { UpdateSettingsInput } from './ai-settings.schema.js';
import { AiSettingsService } from './ai-settings.service.js';
import { toSettingsDto } from './ai-settings.types.js';
import type { AiSettingsDto } from './ai-settings.types.js';

/** Настройки ИИ-агента одного аккаунта. */
@Controller('telegram/accounts/:id/ai')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class AiSettingsController {
  constructor(private readonly settings: AiSettingsService) {}

  @Get('settings')
  async get(@AccountId() accountId: string): Promise<AiSettingsDto> {
    return toSettingsDto(await this.settings.get(accountId));
  }

  @Put('settings')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @AccountId() accountId: string,
    @Body(zod(updateSettingsSchema)) body: UpdateSettingsInput,
  ): Promise<AiSettingsDto> {
    return toSettingsDto(await this.settings.update(accountId, body, user.id));
  }
}
