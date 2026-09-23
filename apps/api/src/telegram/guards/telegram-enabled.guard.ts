import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import { TelegramConfig } from '../telegram.config.js';

/**
 * Без api_id / api_hash раздел Telegram выключен: все его эндпоинты
 * отвечают 503 с подсказкой, что настроить, — веб показывает её как есть.
 */
@Injectable()
export class TelegramEnabledGuard implements CanActivate {
  constructor(private readonly config: TelegramConfig) {}

  canActivate(): boolean {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException(
        'Раздел Telegram не настроен: задайте TELEGRAM_API_ID и TELEGRAM_API_HASH',
      );
    }
    return true;
  }
}
