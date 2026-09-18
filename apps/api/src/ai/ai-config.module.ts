import { Module } from '@nestjs/common';
import { AiConfig } from './ai.config.js';

/**
 * Настройки ИИ из env. Отдельный модуль, потому что AiConfig нужен почти
 * всем подмодулям ИИ, а тянуть ради него что-то ещё не хочется.
 */
@Module({
  providers: [AiConfig],
  exports: [AiConfig],
})
export class AiConfigModule {}
