import { Injectable, NotFoundException } from '@nestjs/common';
import type { TelegramAccountEntity } from '../../telegram/entities/telegram-account.entity.js';
import { toExampleDto } from '../bot.types.js';
import type { ExampleDto } from '../bot.types.js';
import type {
  CreateExampleDto,
  ListExamplesQueryDto,
  UpdateExampleDto,
} from '../dto/examples.dto.js';
import type { BotExampleEntity } from '../entities/bot-example.entity.js';
import { BotExamplesRepository } from '../repositories/bot-examples.repository.js';

/** Примеры реальных диалогов для промпта ответчика. */
@Injectable()
export class BotExamplesService {
  constructor(private readonly examples: BotExamplesRepository) {}

  async list(
    account: TelegramAccountEntity,
    query: ListExamplesQueryDto,
  ): Promise<ExampleDto[]> {
    const rows = await this.examples.list(account.id, query.stage);
    return rows.map(toExampleDto);
  }

  async create(
    account: TelegramAccountEntity,
    dto: CreateExampleDto,
  ): Promise<ExampleDto> {
    const row = await this.examples.create({
      accountId: account.id,
      stage: dto.stage,
      situation: dto.situation,
      client: dto.client,
      practitioner: dto.practitioner,
      enabled: dto.enabled ?? true,
      sort: dto.sort ?? 0,
    });
    return toExampleDto(row);
  }

  async update(
    account: TelegramAccountEntity,
    exampleId: string,
    dto: UpdateExampleDto,
  ): Promise<ExampleDto> {
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

  async remove(
    account: TelegramAccountEntity,
    exampleId: string,
  ): Promise<void> {
    const row = await this.require(account, exampleId);
    await this.examples.delete(row.id);
  }

  private async require(
    account: TelegramAccountEntity,
    exampleId: string,
  ): Promise<BotExampleEntity> {
    const row = await this.examples.findOwned(account.id, exampleId);
    if (!row) throw new NotFoundException('Пример не найден');
    return row;
  }
}
