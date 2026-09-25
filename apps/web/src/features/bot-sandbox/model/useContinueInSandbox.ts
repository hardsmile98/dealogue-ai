import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatQuery } from '@/shared/api';
import { accountLinks } from '@/shared/config';
import { getApiErrorMessage } from '@/shared/lib';
import { useNotify } from '@/shared/ui';
import { useSandboxFromChatMutation } from '../api/sandboxApi';

/**
 * «Продолжить в песочнице»: копирует переписку (до сообщения включительно
 * или целиком) и открывает копию. В реальный чат ничего не уходит.
 * Один хук на всю ленту — а не мутация в каждом сообщении.
 */
export function useContinueInSandbox({ accountId, chatId }: ChatQuery) {
  const navigate = useNavigate();
  const notify = useNotify();
  const [copy, { isLoading }] = useSandboxFromChatMutation();

  const continueFrom = useCallback(
    async (messageId?: number) => {
      try {
        const session = await copy({ accountId, chatId, messageId }).unwrap();
        navigate(accountLinks.sandbox(accountId, session.id));
      } catch (error) {
        notify.error(
          getApiErrorMessage(error, 'Не удалось скопировать переписку'),
        );
      }
    },
    [accountId, chatId, copy, navigate, notify],
  );

  return { continueFrom, isLoading };
}
