import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { LlmError } from '../llm/llm-provider.interface.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { TelegramAccountsService } from '../../telegram/services/telegram-accounts.service.js';
import { sandboxSchema } from '../dto/ai-chat.schema.js';
import { parseBody } from '../dto/parse.js';
import type { AiOverviewDto, ChatAiSummaryDto } from './agent.dto.js';
import { ChatAiService } from './services/chat-ai.service.js';
import { SandboxService } from './services/sandbox.service.js';
import type { SandboxRequest, SandboxResult } from './services/sandbox.service.js';

/** Обзор агента по аккаунту, сводка по чатам и песочница. */
@Controller('telegram/accounts/:id/ai')
@UseGuards(JwtAuthGuard)
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly chatAi: ChatAiService,
    private readonly sandbox: SandboxService,
  ) {}

  @Get('overview')
  async overview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<AiOverviewDto> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.chatAi.overview(accountId);
  }

  @Get('chats')
  async chats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
  ): Promise<ChatAiSummaryDto[]> {
    await this.accounts.requireAccount(user.id, accountId);
    return this.chatAi.listSummaries(accountId);
  }

  @Post('sandbox')
  @HttpCode(HttpStatus.OK)
  async runSandbox(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() body: unknown,
  ): Promise<SandboxResult> {
    await this.accounts.requireAccount(user.id, accountId);
    try {
      return await this.sandbox.run(accountId, parseBody(sandboxSchema, body) as SandboxRequest);
    } catch (error) {
      // Ошибка провайдера или разбора ответа — показываем текстом, а не «500».
      if (error instanceof LlmError) throw new ServiceUnavailableException(error.message);
      this.logger.error(`Песочница: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      throw error;
    }
  }
}
