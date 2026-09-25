import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Range, Timings } from '@/shared/api';
import { getApiErrorMessage, useDraft } from '@/shared/lib';
import { useNotify } from '@/shared/ui';
import { useUpdateBotSettingsMutation } from '../api/botSettingsApi';
import { FormActions } from './FormActions';
import { settingsFormStyles as styles } from './settingsForm.styles';

interface TimingsFormProps {
  accountId: string;
  /** Текущие тайминги с сервера; форма подхватывает их, когда они меняются. */
  initial: Timings;
}

type RangeKey = {
  [K in keyof Timings]: Timings[K] extends Range ? K : never;
}[keyof Timings];
type NumberKey = Exclude<keyof Timings, RangeKey>;

/** Какие тайминги показываем: остальные редкие и живут со значениями по умолчанию. */
const RANGES: { key: RangeKey; label: string; unit: string }[] = [
  { key: 'newLeadReplySec', label: 'Первый ответ новому лиду', unit: 'с' },
  { key: 'diagnosticDelayMin', label: 'Диагностика после ссылок', unit: 'мин' },
  {
    key: 'returnQuestionMin',
    label: 'Вопрос после прочтения диагностики',
    unit: 'мин',
  },
  { key: 'stepHours', label: 'Ступени при молчании', unit: 'ч' },
];

const NUMBERS: { key: NumberKey; label: string; unit: string }[] = [
  {
    key: 'unreadReminderHours',
    label: 'Напоминание о непрочитанном',
    unit: 'ч',
  },
  { key: 'maxReminders', label: 'Напоминаний на чат, не больше', unit: '' },
  {
    key: 'maxTurnsWithoutNudge',
    label: 'Ходов подряд без шага воронки',
    unit: '',
  },
];

/** Пустое поле — 0, отрицательные числа не принимаем. */
function toCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

function withUnit(label: string, unit: string): string {
  return unit ? `${label}, ${unit}` : label;
}

/** Тайминги агента: диапазоны — случайное значение внутри них. */
export function TimingsForm({ accountId, initial }: TimingsFormProps) {
  const { draft: timings, setDraft, dirty, reset } = useDraft(initial);
  const [update, { isLoading }] = useUpdateBotSettingsMutation();
  const notify = useNotify();

  const invalidRanges = RANGES.filter(
    ({ key }) => timings[key].min > timings[key].max,
  ).map(({ key }) => key);

  const setRange = (key: RangeKey, part: keyof Range, value: string) =>
    setDraft((current) => ({
      ...current,
      [key]: { ...current[key], [part]: toCount(value) },
    }));

  const setNumber = (key: NumberKey, value: string) =>
    setDraft((current) => ({ ...current, [key]: toCount(value) }));

  const submit = async () => {
    try {
      await update({ accountId, body: { timings } }).unwrap();
      notify.success('Тайминги сохранены');
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Не удалось сохранить тайминги'));
    }
  };

  return (
    <Stack
      component="form"
      spacing={2}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && invalidRanges.length === 0) void submit();
      }}
    >
      <Grid container spacing={2}>
        {RANGES.map(({ key, label, unit }) => {
          const invalid = invalidRanges.includes(key);
          const labelId = `timing-${key}`;
          return (
            <Grid key={key} size={{ xs: 12, sm: 6 }}>
              <Typography id={labelId} variant="body2" sx={styles.rangeLabel}>
                {withUnit(label, unit)}
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                role="group"
                aria-labelledby={labelId}
                sx={styles.rangeFields}
              >
                <TextField
                  label="от"
                  type="number"
                  size="small"
                  value={timings[key].min}
                  onChange={(event) => setRange(key, 'min', event.target.value)}
                  error={invalid}
                  helperText={invalid ? '«от» больше «до»' : undefined}
                  slotProps={{ htmlInput: { min: 0 } }}
                />
                <TextField
                  label="до"
                  type="number"
                  size="small"
                  value={timings[key].max}
                  onChange={(event) => setRange(key, 'max', event.target.value)}
                  error={invalid}
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              </Stack>
            </Grid>
          );
        })}
        {NUMBERS.map(({ key, label, unit }) => (
          <Grid key={key} size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              label={withUnit(label, unit)}
              type="number"
              size="small"
              value={timings[key]}
              onChange={(event) => setNumber(key, event.target.value)}
              slotProps={{ htmlInput: { min: 0 } }}
              fullWidth
            />
          </Grid>
        ))}
      </Grid>

      <FormActions
        submitLabel="Сохранить тайминги"
        dirty={dirty}
        invalid={invalidRanges.length > 0}
        saving={isLoading}
        onReset={reset}
      />
    </Stack>
  );
}
