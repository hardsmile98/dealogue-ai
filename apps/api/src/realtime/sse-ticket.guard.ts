import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { RequestWithUser } from '../auth/auth.types.js';

export interface SseTicketPayload {
  sub: string;
  login: string;
  kind: 'sse';
}

/**
 * EventSource не умеет заголовки, поэтому SSE открывается по короткоживущему
 * тикету в query (?ticket=). Основной access-токен в URL не попадает.
 */
@Injectable()
export class SseTicketGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const ticket = typeof request.query?.ticket === 'string' ? request.query.ticket : '';
    if (!ticket) throw new UnauthorizedException('Не передан тикет');
    try {
      const payload = await this.jwt.verifyAsync<SseTicketPayload>(ticket);
      if (payload.kind !== 'sse') throw new Error('not an sse ticket');
      request.user = { id: payload.sub, login: payload.login };
      return true;
    } catch {
      throw new UnauthorizedException('Тикет недействителен или истёк');
    }
  }
}
