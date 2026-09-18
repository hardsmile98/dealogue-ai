import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../auth/auth.module.js';
import { TelegramModule } from '../../telegram/telegram.module.js';
import { AiCategoryEntity } from '../entities/ai-category.entity.js';
import { AiDiagnosticEntity } from '../entities/ai-diagnostic.entity.js';
import { AiFactEntity } from '../entities/ai-fact.entity.js';
import { AiNoteEntity } from '../entities/ai-note.entity.js';
import { AiPhraseEntity } from '../entities/ai-phrase.entity.js';
import { AiPlaybookEntity } from '../entities/ai-playbook.entity.js';
import { AiLibraryController } from './library.controller.js';
import { AiLibraryService } from './library.service.js';

/**
 * Библиотека аккаунта (раздел 11 ТЗ): категории, примеры и блоки, факты,
 * диагностики, плейбуки, заметки. Из неё собирается промпт хода.
 */
@Module({
  imports: [
    AuthModule,
    TelegramModule,
    TypeOrmModule.forFeature([
      AiCategoryEntity,
      AiPhraseEntity,
      AiFactEntity,
      AiDiagnosticEntity,
      AiPlaybookEntity,
      AiNoteEntity,
    ]),
  ],
  controllers: [AiLibraryController],
  providers: [AiLibraryService],
  exports: [AiLibraryService],
})
export class AiLibraryModule {}
