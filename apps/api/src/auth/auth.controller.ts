import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { LoginDto } from './dto/login.dto.js';
import type { AuthenticatedUser, LoginResponse } from './auth.types.js';
import type { PublicUser } from '../users/user.types.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /auth/login → { accessToken, user }. Неверная пара — 401. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  /** GET /auth/me — проверка живости токена и актуальные данные пользователя. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): Promise<PublicUser> {
    return this.authService.getProfile(user.id);
  }
}
