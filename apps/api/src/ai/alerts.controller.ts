import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { AlertDto } from './ai.types.js';
import type { AlertStatus } from './entities/alert.entity.js';
import { AlertsService } from './services/alerts.service.js';

class AlertsQueryDto {
  /** Через запятую: open,acknowledged,resolved. По умолчанию — незакрытые. */
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;
}

const KNOWN: AlertStatus[] = ['open', 'acknowledged', 'resolved'];

/** Алерты по всем аккаунтам пользователя. */
@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: AlertsQueryDto): Promise<AlertDto[]> {
    const statuses = (query.status ?? 'open,acknowledged')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is AlertStatus => KNOWN.includes(s as AlertStatus));
    return this.alerts.list(user.id, statuses.length > 0 ? statuses : ['open', 'acknowledged'], query.accountId);
  }

  @Get('count')
  async count(@CurrentUser() user: AuthenticatedUser): Promise<{ open: number }> {
    return { open: await this.alerts.countOpen(user.id) };
  }

  @Post(':id/ack')
  @HttpCode(HttpStatus.OK)
  ack(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<AlertDto> {
    return this.alerts.acknowledge(user.id, id);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<AlertDto> {
    return this.alerts.resolve(user.id, id);
  }
}
