import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../entities/telegram-message.entity.js';
import {
  daysBetween,
  eachDayKey,
  isDayKey,
  isValidTimezone,
  shiftDayKey,
} from '../lib/timezone.js';
import { TelegramConfig } from '../telegram.config.js';
import { toAccountDto, toChatDto, toMessageDto } from '../telegram.types.js';
import type {
  AccountStatsDto,
  ChatDto,
  DailyStatsDto,
  MessageDto,
  StatsTotalsDto,
  TelegramAccountDto,
} from '../telegram.types.js';
import { TelegramDialogStartsService } from './telegram-dialog-starts.service.js';
import { TelegramRuntimeService } from './telegram-runtime.service.js';

const MAX_PERIOD_DAYS = 366;
const CHATS_LIMIT = 500;

/** Чтение для контроллера: список, карточка, удаление, чаты, сообщения, статистика. */
@Injectable()
export class TelegramAccountsService {
  constructor(
    private readonly config: TelegramConfig,
    private readonly runtime: TelegramRuntimeService,
    private readonly dialogStarts: TelegramDialogStartsService,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
  ) {}

  async list(userId: string): Promise<TelegramAccountDto[]> {
    this.ensureEnabled();
    const rows = await this.accounts.find({ where: { userId }, order: { connectedAt: 'ASC' } });
    if (rows.length === 0) return [];
    const today = await this.newChatsToday(rows.map((row) => row.id));
    return rows.map((row) => toAccountDto(row, today.get(row.id) ?? 0));
  }

  async get(userId: string, accountId: string): Promise<TelegramAccountDto> {
    const account = await this.requireAccount(userId, accountId);
    const today = await this.newChatsToday([account.id]);
    return toAccountDto(account, today.get(account.id) ?? 0);
  }

  async remove(userId: string, accountId: string): Promise<void> {
    const account = await this.requireAccount(userId, accountId);
    await this.runtime.stop(account.id, { logout: true });
    await this.accounts.delete({ id: account.id });
  }

  async listChats(userId: string, accountId: string): Promise<ChatDto[]> {
    const account = await this.requireAccount(userId, accountId);
    const rows = await this.chats.find({
      where: { accountId: account.id },
      order: { lastMessageAt: { direction: 'DESC', nulls: 'LAST' } },
      take: CHATS_LIMIT,
    });
    return rows.map(toChatDto);
  }

  async listMessages(userId: string, accountId: string, chatId: string): Promise<MessageDto[]> {
    const account = await this.requireAccount(userId, accountId);
    const chat = await this.chats.findOne({ where: { id: chatId, accountId: account.id } });
    if (!chat) throw new NotFoundException('Чат не найден');
    const rows = await this.messages.find({
      where: { chatId: chat.id },
      order: { sentAt: 'ASC', telegramMessageId: 'ASC' },
    });
    return rows.map(toMessageDto);
  }

  async stats(
    userId: string,
    accountId: string,
    from: string,
    to: string,
    tz?: string,
  ): Promise<AccountStatsDto> {
    const account = await this.requireAccount(userId, accountId);
    if (!isDayKey(from) || !isDayKey(to)) {
      throw new BadRequestException('Даты периода: YYYY-MM-DD');
    }
    if (from > to) throw new BadRequestException('Начало периода позже его конца');
    const length = daysBetween(from, to);
    if (length > MAX_PERIOD_DAYS) {
      throw new BadRequestException(`Период не длиннее ${MAX_PERIOD_DAYS} дней`);
    }
    const timezone = tz && isValidTimezone(tz) ? tz : this.config.timezone;

    const previousTo = shiftDayKey(from, -1);
    const previousFrom = shiftDayKey(from, -length);
    const [current, previous] = await Promise.all([
      this.groupByDayAndCode(account.id, from, to, timezone),
      this.groupByDayAndCode(account.id, previousFrom, previousTo, timezone),
    ]);

    const days = new Map<string, DailyStatsDto>(
      eachDayKey(from, to).map((date) => [date, { date, total: 0, withoutCode: 0, byCode: {} }]),
    );
    const codes = new Map<string, number>();
    const totals = emptyTotals();

    for (const row of current) {
      const count = Number(row.count);
      const day = days.get(row.day);
      if (!day) continue;
      day.total += count;
      totals.total += count;
      if (row.code === null) {
        day.withoutCode += count;
        totals.withoutCode += count;
      } else {
        day.byCode[row.code] = (day.byCode[row.code] ?? 0) + count;
        codes.set(row.code, (codes.get(row.code) ?? 0) + count);
        totals.withCode += count;
      }
    }

    const previousTotals = emptyTotals();
    for (const row of previous) {
      const count = Number(row.count);
      previousTotals.total += count;
      if (row.code === null) previousTotals.withoutCode += count;
      else previousTotals.withCode += count;
    }

    return {
      from,
      to,
      days: [...days.values()],
      codes: [...codes.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count || Number(a.code) - Number(b.code)),
      totals,
      previousTotals,
    };
  }

  // --- внутреннее -----------------------------------------------------------

  private ensureEnabled(): void {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException(
        'Раздел Telegram не настроен: задайте TELEGRAM_API_ID и TELEGRAM_API_HASH',
      );
    }
  }

  private async requireAccount(userId: string, accountId: string): Promise<TelegramAccountEntity> {
    this.ensureEnabled();
    const account = await this.accounts.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Аккаунт не найден');
    return account;
  }

  private groupByDayAndCode(accountId: string, from: string, to: string, timezone: string) {
    return this.dialogStarts.groupByDayAndCode(accountId, from, to, timezone);
  }

  private newChatsToday(accountIds: string[]): Promise<Map<string, number>> {
    return this.dialogStarts.countToday(accountIds, this.config.timezone);
  }
}

function emptyTotals(): StatsTotalsDto {
  return { total: 0, withCode: 0, withoutCode: 0 };
}
