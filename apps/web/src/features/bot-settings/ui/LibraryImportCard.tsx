import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { LIBRARY_KINDS } from '@/shared/api';
import type {
  BotSettingsDto,
  LibraryImportMode,
  LibraryImportResultDto,
} from '@/shared/api';
import { getApiErrorMessage } from '@/shared/lib';
import { ConfirmAction, useNotify } from '@/shared/ui';
import { LIBRARY_KIND_LABELS } from '@/entities/bot';
import { useImportLibraryMutation } from '../api/botSettingsApi';
import { settingsFormStyles as styles } from './settingsForm.styles';

interface LibraryImportCardProps {
  settings: BotSettingsDto;
}

function describeResult(result: LibraryImportResultDto): string {
  const parts = [];
  if (result.inserted > 0) parts.push(`добавлено ${result.inserted}`);
  if (result.updated > 0) parts.push(`обновлено ${result.updated}`);
  if (result.skipped > 0) parts.push(`без изменений ${result.skipped}`);
  return parts.length > 0
    ? `Библиотека загружена: ${parts.join(', ')}.`
    : 'Библиотека загружена.';
}

/** Счётчики библиотеки по видам и импорт стандартной из таблиц. */
export function LibraryImportCard({ settings }: LibraryImportCardProps) {
  const [importLibrary, { isLoading }] = useImportLibraryMutation();
  const notify = useNotify();
  const { total, byKind } = settings.library;

  const run = async (mode: LibraryImportMode) => {
    const result = await importLibrary({
      accountId: settings.accountId,
      mode,
    }).unwrap();
    notify.success(describeResult(result));
  };

  const addMissing = () =>
    run('keep').catch((error: unknown) =>
      notify.error(
        getApiErrorMessage(error, 'Не удалось загрузить библиотеку'),
      ),
    );

  return (
    <Stack spacing={2}>
      {total === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Библиотека пуста. Стандартная собрана из таблиц владельца:
          приветствия, диагностики по категориям и полу, описание услуг, цены,
          возражения.
        </Typography>
      ) : (
        <Box sx={styles.kindCounts}>
          {LIBRARY_KINDS.filter((kind) => byKind[kind]).map((kind) => (
            <Chip
              key={kind}
              size="small"
              variant="outlined"
              label={`${LIBRARY_KIND_LABELS[kind]}: ${byKind[kind]}`}
            />
          ))}
        </Box>
      )}

      <Stack direction="row" spacing={1} useFlexGap sx={styles.importActions}>
        <Button
          variant={total === 0 ? 'contained' : 'outlined'}
          loading={isLoading}
          onClick={() => void addMissing()}
        >
          {total === 0
            ? 'Загрузить стандартную библиотеку'
            : 'Добавить недостающее из стандартной'}
        </Button>
        {total > 0 && (
          <ConfirmAction
            question="Вернуть стандартные тексты?"
            description="Тексты и названия элементов стандартной библиотеки заменятся исходными из таблиц. Включённость и элементы, созданные вручную, не изменятся."
            confirmLabel="Вернуть"
            destructive
            errorText="Не удалось вернуть стандартные тексты"
            onConfirm={() => run('replace')}
          >
            {(ask) => (
              <Button
                variant="text"
                color="inherit"
                disabled={isLoading}
                onClick={ask}
              >
                Вернуть стандартные тексты
              </Button>
            )}
          </ConfirmAction>
        )}
      </Stack>
    </Stack>
  );
}
