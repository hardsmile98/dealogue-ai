import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { AccountId } from '../../telegram/decorators/account.decorator.js';
import { AccountAccessGuard } from '../../telegram/guards/account-access.guard.js';
import { toSettingsDto } from '../settings/ai-settings.types.js';
import { AiResetService } from './ai-reset.service.js';
import type { AiResetResultDto } from './ai-reset.types.js';

/** Сброс ИИ-агента аккаунта к состоянию «из коробки». */
@Controller('telegram/accounts/:id/ai')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class AiResetController {
  constructor(private readonly reset: AiResetService) {}

  /** Необратимо: настройки к дефолтам, библиотека и журналы — в ноль. */
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async resetAccount(
    @CurrentUser() user: AuthenticatedUser,
    @AccountId() accountId: string,
  ): Promise<AiResetResultDto> {
    const { settings, deleted } = await this.reset.resetAccount(accountId, user.id);
    return { settings: toSettingsDto(settings), deleted };
  }
}
