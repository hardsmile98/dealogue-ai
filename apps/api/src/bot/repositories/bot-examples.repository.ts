import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DeepPartial, FindOptionsWhere } from 'typeorm';
import { BotExampleEntity } from '../entities/bot-example.entity.js';
import type { Stage } from '../library/kinds.js';

/** Таблица bot_examples: примеры реальных диалогов для промпта ответчика. */
@Injectable()
export class BotExamplesRepository {
  constructor(
    @InjectRepository(BotExampleEntity)
    private readonly examples: Repository<BotExampleEntity>,
  ) {}

  /** Для редактора: все примеры аккаунта (или этапа) по порядку. */
  list(accountId: string, stage?: Stage): Promise<BotExampleEntity[]> {
    const where: FindOptionsWhere<BotExampleEntity> = { accountId };
    if (stage) where.stage = stage;
    return this.examples.find({
      where,
      order: { stage: 'ASC', sort: 'ASC', createdAt: 'ASC' },
    });
  }

  /** Для хода: только включённые — они идут в промпт ответчика. */
  listEnabled(accountId: string): Promise<BotExampleEntity[]> {
    return this.examples.find({
      where: { accountId, enabled: true },
      order: { stage: 'ASC', sort: 'ASC' },
    });
  }

  findOwned(
    accountId: string,
    exampleId: string,
  ): Promise<BotExampleEntity | null> {
    return this.examples.findOne({ where: { id: exampleId, accountId } });
  }

  create(fields: DeepPartial<BotExampleEntity>): Promise<BotExampleEntity> {
    return this.examples.save(this.examples.create(fields));
  }

  save(example: BotExampleEntity): Promise<BotExampleEntity> {
    return this.examples.save(example);
  }

  async delete(exampleId: string): Promise<void> {
    await this.examples.delete({ id: exampleId });
  }
}
