import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { LIBRARY_KINDS, LIBRARY_KIND_LABELS } from '@/shared/api'
import type { BotSettingsDto, LibraryImportResultDto } from '@/shared/api'
import { getApiErrorMessage } from '@/shared/lib'
import { ConfirmAction } from '@/shared/ui'
import { useImportLibraryMutation } from '../api/botSettingsApi'

interface LibraryImportCardProps {
  settings: BotSettingsDto
}

function describeResult(result: LibraryImportResultDto): string {
  const parts = []
  if (result.inserted > 0) parts.push(`добавлено ${result.inserted}`)
  if (result.updated > 0) parts.push(`обновлено ${result.updated}`)
  if (result.skipped > 0) parts.push(`без изменений ${result.skipped}`)
  return parts.length > 0 ? `Готово: ${parts.join(', ')}.` : 'Готово.'
}

/** Счётчики библиотеки по видам и импорт стандартной из таблиц. */
export function LibraryImportCard({ settings }: LibraryImportCardProps) {
  const [importLibrary, { isLoading }] = useImportLibraryMutation()
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null)

  const run = async (mode: 'keep' | 'replace') => {
    setMessage(null)
    try {
      const result = await importLibrary({ accountId: settings.accountId, mode }).unwrap()
      setMessage({ severity: 'success', text: describeResult(result) })
    } catch (caught) {
      setMessage({
        severity: 'error',
        text: getApiErrorMessage(caught, 'Не удалось загрузить библиотеку'),
      })
    }
  }

  const { total, byKind } = settings.library

  return (
    <Stack spacing={2}>
      {total === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Библиотека пуста. Стандартная собрана из таблиц владельца: приветствия, диагностики
          по категориям и полу, описание услуг, цены, возражения.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
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

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button variant={total === 0 ? 'contained' : 'outlined'} loading={isLoading} onClick={() => void run('keep')}>
          {total === 0 ? 'Загрузить стандартную библиотеку' : 'Добавить недостающее из стандартной'}
        </Button>
        {total > 0 && (
          <ConfirmAction
            question="Вернуть стандартные тексты?"
            description="Тексты и названия элементов стандартной библиотеки заменятся исходными из таблиц. Включённость и элементы, созданные вручную, не изменятся."
            confirmLabel="Вернуть"
            destructive
            onConfirm={() => void run('replace')}
          >
            {(ask) => (
              <Button variant="text" color="inherit" disabled={isLoading} onClick={ask}>
                Вернуть стандартные тексты
              </Button>
            )}
          </ConfirmAction>
        )}
      </Stack>

      {message && <Alert severity={message.severity}>{message.text}</Alert>}
    </Stack>
  )
}
