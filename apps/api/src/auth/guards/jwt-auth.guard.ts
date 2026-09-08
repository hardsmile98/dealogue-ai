import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload, RequestWithUser } from '../auth.types.js';

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Проверяет access-токен из заголовка Authorization и кладёт пользователя
 * в request — оттуда его достаёт декоратор @CurrentUser().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Не передан токен доступа');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      request.user = { id: payload.sub, login: payload.login };
    } catch {
      throw new UnauthorizedException('Токен недействителен или истёк');
    }

    return true;
  }
}
