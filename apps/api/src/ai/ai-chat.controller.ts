import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { TelegramAccountsService } from '../telegram/services/telegram-accounts.service.js';
import { toChatDto } from '../telegram/telegram.types.js';
import type { ChatDto } from '../telegram/telegram.types.js';
import { toRunDto } from './ai.types.js';
import type { AiRunDto } from './ai.types.js';
import { RunsQueryDto, SetChatAiDto, TestGenerateDto } from './dto/ai.dto.js';
import { AiRunEntity } from './entities/ai-run.entity.js';
import { AiAgentService } from './services/ai-agent.service.js';
import type { TestGenerateResult } from './services/ai-agent.service.js';
import { AlertsService } from './services/alerts.service.js';

export interface TestGenerateResponse {
  runId: string;
  decision: TestGenerateResult['decision'];
  guard: TestGenerateResult['guard'];
  prompt: { system: string; messages: { role: string; content: string }[] };
  exchanges: { clientText: string; managerText: string; similarity: number; intent: string | null }[];
  usage: { inputTokens: number; outputTokens: number; cacheHitTokens: number };
  latencyMs: number;
  provider: string;
  model: string;
  actualManagerReply: string | null;
}

/** ИИ на уровне одного чата: включение, песочница, аудит, дожимы, пометка. */
@Controller('telegram/accounts/:id/chats/:chatId')
@UseGuards(JwtAuthGuard)
export class AiChatController {
  constructor(
    private readonly accounts: TelegramAccountsService,
    private readonly agent: AiAgentService,
    private readonly alerts: AlertsService,
    @InjectRepository(AiRunEntity)
    private readonly runs: Repository<AiRunEntity>,
  ) {}

  @Patch('ai')
  async setAi(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: SetChatAiDto,
  ): Promise<ChatDto> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    return toChatDto(await this.agent.setChatAi(chat, dto.enabled, user.id));
  }

  @Post('ai/test')
  @HttpCode(HttpStatus.OK)
  async test(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: TestGenerateDto,
  ): Promise<TestGenerateResponse> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    const result = await this.agent.testGenerate(chat, {
      scriptOverride: dto.scriptOverride,
      followupStep: dto.followupStep,
    });
    return {
      runId: result.runId,
      decision: result.decision,
      guard: result.guard,
      prompt: { system: result.prompt.system, messages: result.prompt.messages },
      exchanges: result.exchanges.map((e) => ({
        clientText: e.clientText,
        managerText: e.managerText,
        similarity: e.similarity,
        intent: e.intent,
      })),
      usage: result.raw.usage,
      latencyMs: result.latencyMs,
      provider: result.provider,
      model: result.model,
      actualManagerReply: result.actualManagerReply,
    };
  }

  @Get('ai/runs')
  async listRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Query() query: RunsQueryDto,
  ): Promise<AiRunDto[]> {
    await this.accounts.requireChat(user.id, accountId, chatId);
    const rows = await this.runs.find({
      where: { chatId },
      order: { createdAt: 'DESC' },
      take: query.limit ?? 20,
    });
    return rows.map(toRunDto);
  }

  @Post('ai/followups/stop')
  @HttpCode(HttpStatus.OK)
  async stopFollowups(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ): Promise<ChatDto> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    return toChatDto(await this.agent.stopFollowups(chat));
  }

  /** Менеджер открыл чат — открытые алерты считаем увиденными. */
  @Post('attention/seen')
  @HttpCode(HttpStatus.OK)
  async seen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ): Promise<{ ok: true }> {
    await this.accounts.requireChat(user.id, accountId, chatId);
    await this.alerts.acknowledgeForChat(user.id, chatId);
    return { ok: true };
  }

  @Post('attention/clear')
  @HttpCode(HttpStatus.OK)
  async clear(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ): Promise<ChatDto> {
    const { chat } = await this.accounts.requireChat(user.id, accountId, chatId);
    await this.alerts.resolveForChat(chat.id, user.id);
    const { chat: fresh } = await this.accounts.requireChat(user.id, accountId, chatId);
    return toChatDto(fresh);
  }
}
