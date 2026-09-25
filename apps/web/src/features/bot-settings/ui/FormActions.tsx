import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { settingsFormStyles as styles } from './settingsForm.styles';

interface FormActionsProps {
  submitLabel: string;
  dirty: boolean;
  /** Есть ошибки в полях — сохранять нельзя. */
  invalid?: boolean;
  saving: boolean;
  onReset: () => void;
}

/**
 * Низ формы настроек: «Сохранить», «Отменить изменения» и подсказка, что
 * правки ещё не сохранены. Кнопки неактивны, пока менять нечего.
 */
export function FormActions({
  submitLabel,
  dirty,
  invalid = false,
  saving,
  onReset,
}: FormActionsProps) {
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={styles.formActions}>
      <Button
        type="submit"
        variant="contained"
        loading={saving}
        disabled={!dirty || invalid}
      >
        {submitLabel}
      </Button>
      <Button onClick={onReset} disabled={!dirty || saving}>
        Отменить изменения
      </Button>
      {dirty && (
        <Typography variant="body2" color="text.secondary" role="status">
          Есть несохранённые изменения
        </Typography>
      )}
    </Stack>
  );
}
