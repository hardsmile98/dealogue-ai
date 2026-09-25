import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import type { ExampleDto } from '@/shared/api';
import { ConfirmAction } from '@/shared/ui';
import { examplesEditorStyles as styles } from './ExamplesEditor.styles';

interface ExampleCardProps {
  example: ExampleDto;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => Promise<unknown>;
}

/** Один пример: ситуация, реплика клиента и ответ практика. */
export function ExampleCard({
  example,
  onToggle,
  onEdit,
  onDelete,
}: ExampleCardProps) {
  return (
    <Box sx={[styles.item, !example.enabled && styles.disabled]}>
      <Box sx={styles.itemHeader}>
        <Typography sx={styles.situation}>{example.situation}</Typography>
        {!example.enabled && <Chip size="small" label="выключен" />}
        <Tooltip
          describeChild
          title={
            example.enabled ? 'Агент видит пример' : 'Агент не видит пример'
          }
        >
          <Switch
            size="small"
            checked={example.enabled}
            onChange={(event) => onToggle(event.target.checked)}
            slotProps={{
              input: { 'aria-label': `Пример «${example.situation}» включён` },
            }}
          />
        </Tooltip>
        <Tooltip title="Изменить">
          <IconButton
            size="small"
            aria-label="Изменить пример"
            onClick={onEdit}
          >
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <ConfirmAction
          question="Удалить пример?"
          description={`«${example.situation}» — агент больше не увидит этот образец.`}
          confirmLabel="Удалить"
          destructive
          errorText="Не удалось удалить пример"
          onConfirm={onDelete}
        >
          {(ask) => (
            <Tooltip title="Удалить">
              <IconButton
                size="small"
                aria-label="Удалить пример"
                onClick={ask}
              >
                <DeleteOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </ConfirmAction>
      </Box>
      <Typography sx={styles.label}>Клиент</Typography>
      <Typography sx={styles.text}>{example.client}</Typography>
      <Typography sx={styles.label}>Практик</Typography>
      <Typography sx={styles.text}>{example.practitioner}</Typography>
    </Box>
  );
}
