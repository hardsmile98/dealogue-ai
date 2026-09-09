import { Controller, HttpCode, HttpStatus, Post, Res, Sse, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { RealtimeService } from './realtime.service.js';
import { SseTicketGuard } from './sse-ticket.guard.js';
import type { SseTicketPayload } from './sse-ticket.guard.js';

const TICKET_TTL_SEC = 60;

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
  ) {}

  /** Короткоживущий тикет для открытия SSE. */
  @Post('ticket')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async ticket(@CurrentUser() user: AuthenticatedUser): Promise<{ ticket: string; expiresInSec: number }> {
    const payload: SseTicketPayload = { sub: user.id, login: user.login, kind: 'sse' };
    const ticket = await this.jwt.signAsync(payload, { expiresIn: TICKET_TTL_SEC });
    return { ticket, expiresInSec: TICKET_TTL_SEC };
  }

  @Sse('events')
  @UseGuards(SseTicketGuard)
  events(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Observable<MessageEvent> {
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('X-Accel-Buffering', 'no');
    return this.realtime
      .subscribe(user.id)
      .pipe(map((event) => ({ data: event, type: event.type }) as MessageEvent));
  }
}
