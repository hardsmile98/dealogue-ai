import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import { toPublicUser } from '../users/user.types.js';
import type { PublicUser } from '../users/user.types.js';
import type { JwtPayload, LoginResponse } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';

const INVALID_CREDENTIALS = 'Неверный логин или пароль';

/**
 * Хеш несуществующего пароля. Сравниваем с ним, когда пользователь не найден,
 * чтобы ответ занимал столько же времени, сколько при найденном, — иначе по
 * времени ответа можно перебирать существующие логины.
 */
const DUMMY_HASH =
  '$2b$12$n01PrEAsdwiDuctwvKLBJuYiCZ8mbyaXbzXQWg/XnTOxWedvRVuyO';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.users.findByLogin(dto.login);
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const payload: JwtPayload = { sub: user.id, login: user.login };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: toPublicUser(user),
    };
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);

    // Токен ещё жив, а пользователя уже нет — считаем сессию недействительной.
    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    return toPublicUser(user);
  }
}
