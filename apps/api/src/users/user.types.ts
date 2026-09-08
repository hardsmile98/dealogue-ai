import type { UserEntity } from './user.entity.js';

/** Форма пользователя, которую можно отдавать клиенту: без хеша пароля. */
export interface PublicUser {
  id: string;
  login: string;
  name: string;
}

export function toPublicUser(user: UserEntity): PublicUser {
  return { id: user.id, login: user.login, name: user.name };
}
