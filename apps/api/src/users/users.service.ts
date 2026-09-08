import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity.js';

/** Логин нечувствителен к регистру и пробелам по краям. */
export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  findByLogin(login: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { login: normalizeLogin(login) } });
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id } });
  }
}
