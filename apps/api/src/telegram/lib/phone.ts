import { BadRequestException } from '@nestjs/common';

/** `+7 (999) 123-45-67` → `+79991234567`; меньше 10 цифр — 400. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new BadRequestException(
      'Укажите номер телефона в международном формате',
    );
  }
  return `+${digits}`;
}
