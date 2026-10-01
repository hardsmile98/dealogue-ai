import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { HANDOFF_AFTER } from '@/shared/api';
import type { HandoffAfter } from '@/shared/api';
import { getApiErrorMessage, useDraft } from '@/shared/lib';
import { useNotify } from '@/shared/ui';
import { HANDOFF_AFTER_LABELS } from '@/entities/bot';
import { useUpdateBotSettingsMutation } from '../api/botSettingsApi';
import { settingsFormStyles as styles } from './settingsForm.styles';

interface HandoffAfterSettingProps {
  accountId: string;
  /** Текущее значение с сервера. */
  initial: HandoffAfter;
}

/**
 * До какого этапа агент ведёт клиента: после него чат уходит менеджеру.
 * Выбор сохраняется сразу; не сохранилось — возвращается прежний.
 */
export function HandoffAfterSetting({
  accountId,
  initial,
}: HandoffAfterSettingProps) {
  const { draft: selected, setDraft, reset } = useDraft(initial);
  const [update, { isLoading }] = useUpdateBotSettingsMutation();
  const notify = useNotify();

  const change = async (next: HandoffAfter) => {
    setDraft(next);
    try {
      await update({ accountId, body: { handoffAfter: next } }).unwrap();
      notify.success(
        `Агент ведёт клиента ${HANDOFF_AFTER_LABELS[next].title.toLowerCase()}`,
      );
    } catch (error) {
      reset();
      notify.error(getApiErrorMessage(error, 'Не удалось сохранить'));
    }
  };

  return (
    <Stack spacing={1.5}>
      <RadioGroup
        value={selected}
        onChange={(_event, value) => void change(value as HandoffAfter)}
        aria-label="До какого этапа ведёт агент"
        sx={styles.handoffOptions}
      >
        {HANDOFF_AFTER.map((key) => {
          const option = HANDOFF_AFTER_LABELS[key];
          return (
            <FormControlLabel
              key={key}
              value={key}
              disabled={isLoading}
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography sx={styles.handoffTitle}>
                    {option.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {option.description}
                  </Typography>
                </Box>
              }
              sx={[
                styles.handoffOption,
                key === selected && styles.handoffOptionSelected,
              ]}
            />
          );
        })}
      </RadioGroup>
      <Typography variant="body2" color="text.secondary">
        В уже начатых чатах, где агент дошёл до выбранного этапа, он больше не
        пишет: чат перейдёт менеджеру при следующем сообщении клиента.
      </Typography>
    </Stack>
  );
}
