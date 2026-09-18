import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AiConfig } from '../ai.config.js';
import type { CircuitBreaker } from './circuit-breaker.js';
import { LlmProviderFactory } from './llm-provider.factory.js';
import type { AiProviderInfoDto } from './llm.types.js';

/** Справочник провайдеров модели и их живость — не привязаны к аккаунту. */
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class LlmController {
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
