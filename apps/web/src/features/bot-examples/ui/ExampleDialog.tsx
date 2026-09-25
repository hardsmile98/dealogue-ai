import { useState } from 'react';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { STAGES } from '@/shared/api';
import type { ExampleBody, Stage } from '@/shared/api';
import { FormDialog } from '@/shared/ui';
import { STAGE_LABELS } from '@/entities/bot';

const SITUATION_MAX_LENGTH = 500;

interface ExampleDialogProps {
  title: string;
  initial: ExampleBody;
  onClose: () => void;
  onSubmit: (body: ExampleBody) => void;
  submitting: boolean;
  error?: unknown;
}

function trimBody(form: ExampleBody): ExampleBody {
  return {
    stage: form.stage,
    situation: form.situation.trim(),
    client: form.client.trim(),
    practitioner: form.practitioner.trim(),
    enabled: form.enabled,
  };
}

/**
 * Пример диалога: этап, ситуация, что написал клиент и как ответил практик.
 * Монтируется только открытым — каждое открытие начинается с `initial`.
 */
export function ExampleDialog({
  title,
  initial,
  onClose,
  onSubmit,
  submitting,
  error,
}: ExampleDialogProps) {
  const [form, setForm] = useState<ExampleBody>(initial);
  const set = <K extends keyof ExampleBody>(key: K, value: ExampleBody[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const trimmed = trimBody(form);
  const valid =
    trimmed.situation !== '' &&
    trimmed.client !== '' &&
    trimmed.practitioner !== '';

  return (
    <FormDialog
      open
      title={title}
      onClose={onClose}
      onSubmit={() => onSubmit(trimmed)}
      submitting={submitting}
      submitDisabled={!valid}
      error={error}
      maxWidth="md"
    >
      <TextField
        select
        label="Этап"
        value={form.stage}
        onChange={(event) => set('stage', event.target.value as Stage)}
        helperText="На этом этапе агент увидит пример как образец"
      >
        {STAGES.map((stage) => (
          <MenuItem key={stage} value={stage}>
            {STAGE_LABELS[stage]}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Ситуация"
        placeholder="Например: спрашивает цену до диагностики"
        value={form.situation}
        onChange={(event) => set('situation', event.target.value)}
        required
        slotProps={{ htmlInput: { maxLength: SITUATION_MAX_LENGTH } }}
      />
      <TextField
        label="Клиент написал"
        multiline
        minRows={2}
        maxRows={8}
        value={form.client}
        onChange={(event) => set('client', event.target.value)}
        required
      />
      <TextField
        label="Практик ответил"
        multiline
        minRows={3}
        maxRows={12}
        value={form.practitioner}
        onChange={(event) => set('practitioner', event.target.value)}
        required
        helperText="Имена, даты и города лучше заменить на обобщённые"
      />
      <FormControlLabel
        control={
          <Switch
            checked={form.enabled}
            onChange={(event) => set('enabled', event.target.checked)}
          />
        }
        label="Агент видит этот пример"
      />
    </FormDialog>
  );
}
