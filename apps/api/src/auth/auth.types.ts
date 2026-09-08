import type { Request } from 'express';
import type { PublicUser } from '../users/user.types.js';

/** Полезная нагрузка access-токена. */
export interface JwtPayload {
  /** id пользователя (стандартное поле JWT). */
  sub: string;
  login: string;
}

/** То, что JwtAuthGuard кладёт в request после проверки токена. */
export interface AuthenticatedUser {
  id: string;
  login: string;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

export interface LoginResponse {
  accessToken: string;
  user: PublicUser;
}
