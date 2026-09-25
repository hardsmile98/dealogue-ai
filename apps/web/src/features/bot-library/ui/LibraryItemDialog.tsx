import { useState } from 'react';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { GENDERS, LANGUAGES, LIBRARY_KINDS } from '@/shared/api';
import type {
  Gender,
  Language,
  LibraryItemBody,
  LibraryKind,
} from '@/shared/api';
import { FormDialog } from '@/shared/ui';
import { CLIENT_GENDER_LABELS, LIBRARY_KIND_LABELS } from '@/entities/bot';
import { categoryOptions } from '../lib/library';
import { libraryEditorStyles as styles } from './LibraryEditor.styles';

const TITLE_MAX_LENGTH = 200;

/** Селект с пустым вариантом («для всех»): показывать его, а не пустое поле. */
const EMPTY_OPTION_SLOT_PROPS = {
  inputLabel: { shrink: true },
  select: { displayEmpty: true },
} as const;

interface LibraryItemDialogProps {
  title: string;
  initial: LibraryItemBody;
  onClose: () => void;
  onSubmit: (body: LibraryItemBody) => void;
  submitting: boolean;
  error?: unknown;
}

/** Элемент библиотеки. В текстах можно ставить {{bio}} и {{links}} — их подставит образ. */
export function LibraryItemDialog({
  title,
  initial,
  onClose,
  onSubmit,
  submitting,
  error,
}: LibraryItemDialogProps) {
  const [form, setForm] = useState<LibraryItemBody>(initial);
  const set = <K extends keyof LibraryItemBody>(
    key: K,
    value: LibraryItemBody[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const categories = categoryOptions(form.kind);
  const valid = form.title.trim() !== '' && form.text.trim() !== '';

  const submit = () =>
    onSubmit({
      ...form,
      // Категория есть только у диагностик и возражений.
      category: categories ? form.category : null,
      title: form.title.trim(),
      text: form.text.trim(),
    });

  return (
    <FormDialog
      open
      title={title}
      onClose={onClose}
      onSubmit={submit}
      submitting={submitting}
      submitDisabled={!valid}
      error={error}
      maxWidth="md"
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          fullWidth
          label="Вид"
          value={form.kind}
          onChange={(event) => set('kind', event.target.value as LibraryKind)}
        >
          {LIBRARY_KINDS.map((kind) => (
            <MenuItem key={kind} value={kind}>
              {LIBRARY_KIND_LABELS[kind]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Язык"
          value={form.language}
          onChange={(event) => set('language', event.target.value as Language)}
          sx={styles.languageSelect}
        >
          {LANGUAGES.map((language) => (
            <MenuItem key={language} value={language}>
              {language}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Для кого"
          value={form.gender ?? ''}
          onChange={(event) =>
            set('gender', (event.target.value || null) as Gender | null)
          }
          sx={styles.genderSelect}
          slotProps={EMPTY_OPTION_SLOT_PROPS}
        >
          <MenuItem value="">для всех</MenuItem>
          {GENDERS.map((gender) => (
            <MenuItem key={gender} value={gender}>
              {CLIENT_GENDER_LABELS[gender]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {categories && (
        <TextField
          select
          label="Категория"
          value={form.category ?? ''}
          onChange={(event) => set('category', event.target.value || null)}
          slotProps={EMPTY_OPTION_SLOT_PROPS}
        >
          <MenuItem value="">без категории</MenuItem>
          {categories.map((category) => (
            <MenuItem key={category.key} value={category.key}>
              {category.title}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField
        label="Название"
        value={form.title}
        onChange={(event) => set('title', event.target.value)}
        required
        slotProps={{ htmlInput: { maxLength: TITLE_MAX_LENGTH } }}
      />
      <TextField
        label="Текст"
        multiline
        minRows={6}
        maxRows={20}
        value={form.text}
        onChange={(event) => set('text', event.target.value)}
        required
        helperText="{{bio}} и {{links}} подставятся из образа практика"
      />
      <FormControlLabel
        control={
          <Switch
            checked={form.enabled}
            onChange={(event) => set('enabled', event.target.checked)}
          />
        }
        label="Агент использует этот текст"
      />
    </FormDialog>
  );
}
