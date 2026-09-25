import type { Stage } from '@/shared/api';
import { useNotify } from '@/shared/ui';
import { useCreateExampleMutation } from '../api/examplesApi';
import { ExampleDialog } from './ExampleDialog';

/** Заготовка примера из переписки: что написал клиент и что ответили. */
export interface ExampleDraft {
  /** Сообщения клиента перед ответом — одним текстом. */
  client: string;
  /** Ответ практика. */
  practitioner: string;
  stage: Stage;
}

interface AddExampleDialogProps {
  accountId: string;
  /** null — диалог закрыт. */
  draft: ExampleDraft | null;
  onClose: () => void;
}

/**
 * «В примеры»: удачный ответ из реального чата становится образцом для
 * агента. Один диалог на всю переписку — открывается с заготовкой из
 * выбранного сообщения.
 */
export function AddExampleDialog({
  accountId,
  draft,
  onClose,
}: AddExampleDialogProps) {
  const [create, { isLoading, error, reset }] = useCreateExampleMutation();
  const notify = useNotify();

  if (!draft) return null;

  const close = () => {
    reset();
    onClose();
  };

  return (
    <ExampleDialog
      title="Пример для агента"
      initial={{ ...draft, situation: '', enabled: true }}
      onClose={close}
      onSubmit={(body) => {
        create({ accountId, body })
          .unwrap()
          .then(() => {
            notify.success('Пример добавлен');
            close();
          })
          // Ошибку показывает сам диалог — по `error` мутации.
          .catch(() => undefined);
      }}
      submitting={isLoading}
      error={error}
    />
  );
}
