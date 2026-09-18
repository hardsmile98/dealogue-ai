import { Module } from '@nestjs/common';
import { AgentModule } from './agent/agent.module.js';
import { AiConfigModule } from './ai-config.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { AiJobsModule } from './jobs/ai-jobs.module.js';
import { AiLibraryModule } from './library/library.module.js';
import { LlmModule } from './llm/llm.module.js';
import { AiSettingsModule } from './settings/ai-settings.module.js';
import { AiStatsModule } from './stats/stats.module.js';

/**
 * ИИ-агент воронки (docs/ai-agent-spec.md) — сборка подмодулей, своего
 * содержимого у неё нет. Зависит от TelegramModule (события, отправка,
 * доступ к чатам); Telegram про ИИ не знает.
 *
 * Разделение по ответственности:
 *   AiConfigModule   — настройки из env
 *   LlmModule        — провайдеры модели и предохранители
 *   AiJobsModule     — очередь отложенной работы и воркер
 *   AiSettingsModule — настройки агента на аккаунте
 *   AiLibraryModule  — тексты, из которых собирается промпт
 *   AlertsModule     — алерты менеджеру и пометка «требует внимания»
 *   AgentModule      — сам ход: Planner → Composer → Guard → Outbound
 *   AiStatsModule    — воронка, касания, черновики, расход токенов
 */
@Module({
  imports: [
    AiConfigModule,
    LlmModule,
    AiJobsModule,
    AiSettingsModule,
    AiLibraryModule,
    AlertsModule,
    AgentModule,
    AiStatsModule,
  ],
})
export class AiModule {}
