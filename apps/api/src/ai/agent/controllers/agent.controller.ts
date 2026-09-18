import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { zod } from '../../../common/pipes/zod-validation.pipe.js';
import { AccountId } from '../../../telegram/decorators/account.decorator.js';
import { AccountAccessGuard } from '../../../telegram/guards/account-access.guard.js';
import { sandboxSchema } from '../dto/chat.schema.js';
import type { AiOverviewDto, ChatAiSummaryDto } from '../dto/agent.dto.js';
import { ChatAiService } from '../services/chat-ai.service.js';
import { SandboxService } from '../services/sandbox.service.js';
import type { SandboxRequest, SandboxResult } from '../services/sandbox.service.js';

/** Обзор агента по аккаунту, сводка по чатам и песочница. */
@Controller('telegram/accounts/:id/ai')
@UseGuards(JwtAuthGuard, AccountAccessGuard)
export class AgentController {
  constructor(
    private readonly chatAi: ChatAiService,
    private readonly sandbox: SandboxService,
  ) {}

  @Get('overview')
  overview(@AccountId() accountId: string): Promise<AiOverviewDto> {
    return this.chatAi.overview(accountId);
  }

  @Get('chats')
  chats(@AccountId() accountId: string): Promise<ChatAiSummaryDto[]> {
    return this.chatAi.listSummaries(accountId);
  }

  /** Ошибку провайдера в 503 превращает AllExceptionsFilter. */
  @Post('sandbox')
  @HttpCode(HttpStatus.OK)
  runSandbox(
    @AccountId() accountId: string,
    @Body(zod(sandboxSchema)) body: SandboxRequest,
  ): Promise<SandboxResult> {
    return this.sandbox.run(accountId, body);
  }
}
