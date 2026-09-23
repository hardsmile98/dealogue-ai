import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { RequestWithUser } from '../../auth/auth.types.js';
import type { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import { TelegramAccountsService } from '../services/telegram-accounts.service.js';

/** Что guard кладёт в request для декораторов @Account() и @Chat(). */
export interface RequestWithAccount extends RequestWithUser {
  account?: TelegramAccountEntity;
  chat?: TelegramChatEntity;
}

/** Ровно то, что принимает ParseUUIDPipe без указания версии. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Владение аккаунтом (и чатом, если в пути есть `:chatId`) — один раз на
 * запрос, до пайпов и обработчика. Аккаунт и чат ищутся параллельно.
 * Найденные строки кладутся в request, а метод получает их через
 * @Account() / @Chat(). Ставится после JwtAuthGuard.
 */
@Injectable()
export class AccountAccessGuard implements CanActivate {
  constructor(private readonly accounts: TelegramAccountsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAccount>();
    if (!request.user) {
      throw new InternalServerErrorException('AccountAccessGuard использован без JwtAuthGuard');
    }
    const params = (request.params ?? {}) as Record<string, string | undefined>;
    const { account, chat } = await this.accounts.requireAccess(
      request.user.id,
      requireUuid(params.id, 'id'),
      params.chatId === undefined ? undefined : requireUuid(params.chatId, 'chatId'),
    );
    request.account = account;
    if (chat) request.chat = chat;
    return true;
  }
}

/** Сообщение то же, что у ParseUUIDPipe, — контракт для веба не меняется. */
function requireUuid(value: string | undefined, name: string): string {
  if (!value || !UUID.test(value)) {
    throw new BadRequestException(`Validation failed (uuid is expected for ${name})`);
  }
  return value;
}
