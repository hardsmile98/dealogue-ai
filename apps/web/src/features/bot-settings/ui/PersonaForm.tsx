import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import type { Persona, PersonaLink } from '@/shared/api';
import { getApiErrorMessage, useDraft } from '@/shared/lib';
import { useNotify } from '@/shared/ui';
import { useUpdateBotSettingsMutation } from '../api/botSettingsApi';
import { FormActions } from './FormActions';
import { settingsFormStyles as styles } from './settingsForm.styles';

interface PersonaFormProps {
  accountId: string;
  /** Текущий образ с сервера; форма подхватывает его, когда он меняется. */
  initial: Persona;
}

const MAX_LINKS = 10;

const LINK_PLACEHOLDERS: PersonaLink[] = [
  { title: '🔮 Instagram', url: 'https://www.instagram.com/…' },
  { title: '📲 Telegram', url: 'https://t.me/…' },
];

/**
 * Образ практика: имя, пол, биография, ссылки на страницы. Биография
 * подставляется в тексты библиотеки вместо {{bio}}, ссылки — вместо {{links}}.
 */
export function PersonaForm({ accountId, initial }: PersonaFormProps) {
  const { draft: persona, setDraft, dirty, reset } = useDraft(initial);
  const [update, { isLoading }] = useUpdateBotSettingsMutation();
  const notify = useNotify();
  const nameMissing = persona.name.trim() === '';

  const patch = (next: Partial<Persona>) =>
    setDraft((current) => ({ ...current, ...next }));

  const setLink = (index: number, next: Partial<PersonaLink>) =>
    setDraft((current) => ({
      ...current,
      links: current.links.map((link, i) =>
        i === index ? { ...link, ...next } : link,
      ),
    }));

  const removeLink = (index: number) =>
    setDraft((current) => ({
      ...current,
      links: current.links.filter((_, i) => i !== index),
    }));

  const addLink = () =>
    setDraft((current) => ({
      ...current,
      links: [...current.links, { title: '', url: '' }],
    }));

  const submit = async () => {
    try {
      await update({ accountId, body: { persona } }).unwrap();
      notify.success('Образ сохранён');
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Не удалось сохранить образ'));
    }
  };

  return (
    <Stack
      component="form"
      spacing={2}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !nameMissing) void submit();
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Имя"
          value={persona.name}
          onChange={(event) => patch({ name: event.target.value })}
          required
          // Ошибку показываем, только когда форму начали править.
          error={dirty && nameMissing}
          helperText={
            dirty && nameMissing
              ? 'Без имени агенту не от чьего лица писать'
              : ' '
          }
          fullWidth
        />
        <TextField
          select
          label="Пол практика"
          value={persona.gender}
          onChange={(event) =>
            patch({ gender: event.target.value as Persona['gender'] })
          }
          helperText=" "
          sx={styles.genderSelect}
        >
          <MenuItem value="m">Мужской</MenuItem>
          <MenuItem value="f">Женский</MenuItem>
        </TextField>
      </Stack>

      <TextField
        label="Биография"
        helperText="Откуда, где живёт, как пришёл к практике. Подставляется в тексты вместо {{bio}} и нужна, чтобы отвечать на вопросы о себе."
        value={persona.bio}
        onChange={(event) => patch({ bio: event.target.value })}
        multiline
        minRows={3}
        fullWidth
      />

      <Stack
        spacing={{ xs: 2.5, sm: 1.5 }}
        component="fieldset"
        sx={styles.fieldset}
      >
        <Typography variant="subtitle2" component="legend">
          Ссылки на страницы
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Подставляются в тексты вместо {'{{links}}'}: подпись с эмодзи и адрес
          с новой строки.
        </Typography>
        {persona.links.map((link, index) => {
          const placeholder =
            LINK_PLACEHOLDERS[index % LINK_PLACEHOLDERS.length];
          return (
            <Stack key={index} direction="row" spacing={1} sx={styles.linkRow}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={styles.linkFields}
              >
                <TextField
                  label="Подпись"
                  placeholder={placeholder?.title}
                  value={link.title}
                  onChange={(event) =>
                    setLink(index, { title: event.target.value })
                  }
                  size="small"
                  sx={styles.linkTitle}
                />
                <TextField
                  label="Адрес"
                  placeholder={placeholder?.url}
                  value={link.url}
                  onChange={(event) =>
                    setLink(index, { url: event.target.value })
                  }
                  size="small"
                  type="url"
                  fullWidth
                />
              </Stack>
              <Tooltip title="Убрать ссылку">
                <IconButton
                  aria-label={`Убрать ссылку ${link.title || index + 1}`}
                  onClick={() => removeLink(index)}
                >
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          );
        })}
        {persona.links.length < MAX_LINKS && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={addLink}
            sx={styles.addLink}
          >
            Добавить ссылку
          </Button>
        )}
      </Stack>

      <FormActions
        submitLabel="Сохранить образ"
        dirty={dirty}
        invalid={nameMissing}
        saving={isLoading}
        onReset={reset}
      />
    </Stack>
  );
}
