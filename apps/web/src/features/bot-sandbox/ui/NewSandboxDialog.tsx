import { useState } from 'react';
import TextField from '@mui/material/TextField';
import { FormDialog } from '@/shared/ui';

const NAME_MAX_LENGTH = 200;

interface NewSandboxDialogProps {
  onClose: () => void;
  onSubmit: (clientName: string) => void;
  submitting: boolean;
  error?: unknown;
}

/**
 * Новый диалог песочницы: имя клиента в профиле Telegram. По нему, как в
 * живом чате, агент определяет пол, а от пола зависит диагностика (у
 * «Отношений» тексты только женские и мужские). Пустое — клиент без имени.
 * Монтируется только открытым — каждое открытие начинается с пустого поля.
 */
export function NewSandboxDialog({
  onClose,
  onSubmit,
  submitting,
  error,
}: NewSandboxDialogProps) {
  const [clientName, setClientName] = useState('');

  return (
    <FormDialog
      open
      title="Новый диалог"
      onClose={onClose}
      onSubmit={() => onSubmit(clientName.trim())}
      submitLabel="Создать"
      submitting={submitting}
      error={error}
      errorText="Не удалось создать диалог"
      maxWidth="xs"
    >
      <TextField
        label="Имя клиента в Telegram"
        placeholder="Например: Анна"
        value={clientName}
        onChange={(event) => setClientName(event.target.value)}
        autoFocus
        helperText="По имени агент определяет пол, как в живом чате. Пусто — клиент без имени: пол только по словам клиента."
        slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
      />
    </FormDialog>
  );
}
