import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { AiConfigModule } from '../ai-config.module.js';
import { LlmController } from './llm.controller.js';
import { LlmProviderFactory } from './llm-provider.factory.js';

/** Провайдеры модели: выбор по настройкам, предохранители, справочник для веба. */
@Module({
  imports: [AuthModule, AiConfigModule],
  controllers: [LlmController],
  providers: [LlmProviderFactory],
  exports: [LlmProviderFactory],
})
export class LlmModule {}
