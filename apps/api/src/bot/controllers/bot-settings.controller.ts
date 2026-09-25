import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { Account } from '../../telegram/decorators/account.decorator.js';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { AccountAccessGuard } from '../../telegram/guards/account-access.guard.js';
import type { BotSettingsDto, HandoffChatDto } from '../bot.types.js';
import { SetBotEnabledDto, UpdateBotSettingsDto } from '../dto/settings.dto.js';
import { BotChatStateService } from '../services/bot-chat-state.service.js';
import { BotSettingsService } from '../services/bot-settings.service.js';

/**
 * Настройки агента на аккаунте. Без TelegramEnabledGuard: образ и тексты
 * можно править и когда раздел Telegram не настроен.
 */
@Controller('telegram/accounts/:id/bot')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class BotSettingsController {
  constructor(
    private readonly settings: BotSettingsService,
    private readonly states: BotChatStateService,
  ) {}

  /** Список «у менеджера»: ждущие ответа сверху, дольше всех ждущие первыми. */
  @Get('handoffs')
  handoffs(
    @Account() account: TelegramAccountEntity,
  ): Promise<HandoffChatDto[]> {
    return this.states.handoffs(account);
  }

  @Get()
  get(@Account() account: TelegramAccountEntity): Promise<BotSettingsDto> {
    return this.settings.describe(account);
  }

  /** Образ, тайминги, модель — меняется только присланное. */
  @Put()
  update(
    @Account() account: TelegramAccountEntity,
    @Body() dto: UpdateBotSettingsDto,
  ): Promise<BotSettingsDto> {
    return this.settings.update(account, dto);
  }

  /** Включить или выключить агент для новых диалогов аккаунта. */
  @Put('enabled')
  setEnabled(
    @Account() account: TelegramAccountEntity,
    @Body() dto: SetBotEnabledDto,
  ): Promise<BotSettingsDto> {
    return this.settings.setEnabled(account, dto.enabled);
  }
}
