import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { AuthenticatedUser, RequestWithUser } from '../auth.types.js';

/** Достаёт пользователя, положенного в request'е JwtAuthGuard'ом. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new InternalServerErrorException(
        'CurrentUser использован без JwtAuthGuard',
      );
    }

    return request.user;
  },
);
