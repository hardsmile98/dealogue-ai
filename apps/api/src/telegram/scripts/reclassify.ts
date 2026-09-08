/**
 * Пересчёт кодов у всех начал диалогов текущим парсером:
 *   npm run telegram:reclassify            — только строки со старой версией парсера
 *   npm run telegram:reclassify -- --all   — вообще все строки
 * Полезно после правки шаблонов в lib/lead-code.ts.
 */
import 'dotenv/config';
import AppDataSource from '../../database/data-source.js';
import { TelegramDialogStartEntity } from '../entities/telegram-dialog-start.entity.js';
import { TelegramDialogStartsService } from '../services/telegram-dialog-starts.service.js';

const all = process.argv.includes('--all');

await AppDataSource.initialize();
try {
  const repo = AppDataSource.getRepository(TelegramDialogStartEntity);
  if (all) {
    await repo.update({}, { parserVersion: 0 });
  }
  const service = new TelegramDialogStartsService(repo);
  const updated = await service.reclassifyOutdated();
  console.log(`Пересчитано строк: ${updated}`);
} finally {
  await AppDataSource.destroy();
}
