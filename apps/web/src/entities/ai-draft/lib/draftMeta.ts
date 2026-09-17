import type { DraftKind, DraftStatus } from '@/shared/api'

export const DRAFT_KIND_META: Record<DraftKind, { label: string; description: string; color: 'warning' | 'info' }> = {
  handoff: {
    label: 'Нужен ответ менеджера',
    description: 'Бот остановился и предложил вариант ответа — решаете вы.',
    color: 'warning',
  },
  supervised: {
    label: 'Ход ждёт подтверждения',
    description: 'Бот сочинил сообщение, но под контролем отправляет только после вашего «Отправить».',
    color: 'info',
  },
}

export const DRAFT_STATUS_META: Record<DraftStatus, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'info' }> = {
  pending: { label: 'ждёт решения', color: 'warning' },
  pending_classification: { label: 'без ответа модели', color: 'warning' },
  sent_as_is: { label: 'отправлен как есть', color: 'success' },
  edited: { label: 'отправлен с правками', color: 'success' },
  replaced: { label: 'заменён ответом менеджера', color: 'primary' },
  dismissed: { label: 'не отвечали', color: 'default' },
  superseded: { label: 'устарел', color: 'default' },
}

export function isDraftOpen(status: DraftStatus): boolean {
  return status === 'pending' || status === 'pending_classification'
}
