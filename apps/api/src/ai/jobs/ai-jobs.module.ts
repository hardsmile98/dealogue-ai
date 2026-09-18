import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConfigModule } from '../ai-config.module.js';
import { AiJobEntity } from '../entities/ai-job.entity.js';
import { AiJobWorker } from './ai-job-worker.service.js';
import { AiJobsService } from './ai-jobs.service.js';

/**
 * Очередь отложенной работы агента (раздел 7 ТЗ). Воркер один на процесс;
 * обработчики типов job'ов регистрируют сами модули при старте
 * (`worker.register(...)`), поэтому очередь про них ничего не знает.
 */
@Module({
  imports: [AiConfigModule, TypeOrmModule.forFeature([AiJobEntity])],
  providers: [AiJobsService, AiJobWorker],
  exports: [AiJobsService, AiJobWorker],
})
export class AiJobsModule {}
