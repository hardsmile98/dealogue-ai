import type { ReactNode } from 'react';
import { formatPhone } from '@/shared/lib';
import { ConfirmAction, useNotify } from '@/shared/ui';
import type { TelegramAccount } from '@/entities/telegram-account';
import { useRemoveAccountMutation } from '../api/removeApi';

interface RemoveAccountActionProps {
  account: TelegramAccount;
  onRemoved?: () => void;
  /** Триггер: кнопка, иконка или пункт меню — получает функцию, открывающую подтверждение. */
  children: (ask: () => void) => ReactNode;
}

/**
 * Удаление аккаунта с подтверждением: завершает сессию Telegram и стирает
 * историю. Пока запрос идёт, диалог ждёт; ошибка остаётся в диалоге.
 */
export function RemoveAccountAction({
  account,
  onRemoved,
  children,
}: RemoveAccountActionProps) {
  const [removeAccount] = useRemoveAccountMutation();
  const notify = useNotify();

  const remove = async () => {
    await removeAccount(account.id).unwrap();
    notify.success(`Аккаунт ${account.displayName} удалён`);
    onRemoved?.();
  };

  return (
    <ConfirmAction
      question={`Удалить аккаунт ${account.displayName}?`}
      description={
        <>
          Сессия Telegram для номера {formatPhone(account.phone)} будет
          завершена, а чаты, сообщения и статистика по этому аккаунту — удалены
          из Dealogue. В самом Telegram переписка останется.
        </>
      }
      confirmLabel="Удалить"
      destructive
      errorText="Не удалось удалить аккаунт"
      onConfirm={remove}
    >
      {children}
    </ConfirmAction>
  );
}
