import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { toExampleDto } from '../bot.types.js';
import type { ExampleDto } from '../bot.types.js';
import type { CreateExampleDto, ListExamplesQueryDto, UpdateExampleDto } from '../dto/examples.dto.js';
import { BotExampleEntity } from '../entities/bot-example.entity.js';

/** Примеры реальных диалогов для промпта ответчика. */
@Injectable()
export class BotExamplesService {
  constructor(
    @InjectRepository(BotExampleEntity)
    private readonly examples: Repository<BotExampleEntity>,
  ) {}

  async list(account: TelegramAccountEntity, query: ListExamplesQueryDto): Promise<ExampleDto[]> {
    const where: FindOptionsWhere<BotExampleEntity> = { accountId: account.id };
    if (query.stage) where.stage = query.stage;
    const rows = await this.examples.find({ where, order: { stage: 'ASC', sort: 'ASC', createdAt: 'ASC' } });
    return rows.map(toExampleDto);
  }

  async create(account: TelegramAccountEntity, dto: CreateExampleDto): Promise<ExampleDto> {
    const row = await this.examples.save(
      this.examples.create({
        accountId: account.id,
        stage: dto.stage,
        situation: dto.situation,
        client: dto.client,
        practitioner: dto.practitioner,
        enabled: dto.enabled ?? true,
        sort: dto.sort ?? 0,
      }),
    );
    return toExampleDto(row);
  }

  async update(account: TelegramAccountEntity, exampleId: string, dto: UpdateExampleDto): Promise<ExampleDto> {
    const row = await this.require(account, exampleId);
    if (dto.stage !== undefined) row.stage = dto.stage;
    if (dto.situation !== undefined) row.situation = dto.situation;
    if (dto.client !== undefined) row.client = dto.client;
    if (dto.practitioner !== undefined) row.practitioner = dto.practitioner;
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    if (dto.sort !== undefined) row.sort = dto.sort;
    await this.examples.save(row);
    return toExampleDto(row);
  }

  async remove(account: TelegramAccountEntity, exampleId: string): Promise<void> {
    const row = await this.require(account, exampleId);
    await this.examples.delete({ id: row.id });
  }

  private async require(account: TelegramAccountEntity, exampleId: string): Promise<BotExampleEntity> {
    const row = await this.examples.findOne({ where: { id: exampleId, accountId: account.id } });
    if (!row) throw new NotFoundException('Пример не найден');
    return row;
  }
}
