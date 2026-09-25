import { formatPhone, joinParts } from '@/shared/lib';

interface Contacts {
  username: string | null;
  phone: string | null;
}

/** «@username · +7 915 123-45-67» — пустые части пропускаются. */
export function formatContacts({ username, phone }: Contacts): string {
  return joinParts([
    username ? `@${username}` : null,
    phone ? formatPhone(phone) : null,
  ]);
}
