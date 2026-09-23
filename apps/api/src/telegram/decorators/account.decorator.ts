import {
  createParamDecorator,
  InternalServerErrorException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { TelegramAccountEntity } from '../entities/telegram-account.entity.js';
import type { TelegramChatEntity } from '../entities/telegram-chat.entity.js';
import type { RequestWithAccount } from '../guards/account-access.guard.js';

/** Аккаунт из пути `:id`, уже проверенный AccountAccessGuard. */
export const Account = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TelegramAccountEntity => {
    const { account } = request(context);
    if (!account)
      throw new InternalServerErrorException(
        '@Account() использован без AccountAccessGuard',
      );
    return account;
  },
);

/** Чат из пути `:chatId`, уже проверенный на принадлежность аккаунту. */
export const Chat = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TelegramChatEntity => {
    const { chat } = request(context);
    if (!chat)
      throw new InternalServerErrorException(
        '@Chat() использован без AccountAccessGuard или без :chatId в пути',
      );
    return chat;
  },
);

function request(context: ExecutionContext): RequestWithAccount {
  return context.switchToHttp().getRequest<RequestWithAccount>();
}
