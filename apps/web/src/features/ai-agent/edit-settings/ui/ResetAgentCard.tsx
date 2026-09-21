import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { getApiErrorMessage } from '@/shared/lib'
import { ConfirmAction, SectionCard } from '@/shared/ui'
import type { AiResetCountsDto } from '@/shared/api'
import { useResetAiAccountMutation } from '@/entities/ai-agent'
import { aiSettingsStyles as styles } from './AiSettingsForm.styles'

interface ResetAgentCardProps {
  accountId: string
}

/** Разделы в порядке отчёта: сначала контент, потом работа агента. */
const SECTIONS: { key: keyof AiResetCountsDto; label: string }[] = [
  { key: 'phrases', label: 'тексты библиотеки' },
  { key: 'facts', label: 'факты' },
  { key: 'diagnostics', label: 'диагностики' },
  { key: 'categories', label: 'категории' },
  { key: 'notes', label: 'заметки' },
  { key: 'playbooks', label: 'плейбуки' },
  { key: 'chatStates', label: 'состояния чатов' },
  { key: 'turns', label: 'ходы' },
  { key: 'drafts', label: 'черновики' },
  { key: 'events', label: 'события' },
  { key: 'jobs', label: 'отложенные задачи' },
  { key: 'stats', label: 'дни статистики' },
  { key: 'alerts', label: 'алерты' },
]

function describe(deleted: AiResetCountsDto): string {
  const parts = SECTIONS.filter((item) => deleted[item.key] > 0).map(
    (item) => `${item.label} — ${deleted[item.key]}`,
  )
  return parts.length > 0 ? parts.join(', ') : 'удалять было нечего'
}

/**
 * Сброс аккаунта к состоянию «из коробки». Живёт вне формы настроек: форма
 * пересоздаётся после каждого сохранения, а отчёт о сбросе должен остаться
 * на экране.
 */
export function ResetAgentCard({ accountId }: ResetAgentCardProps) {
  const [reset, { isLoading, data, error }] = useResetAiAccountMutation()

  return (
    <SectionCard title="Сброс" subtitle="Вернуть агента к состоянию только что заведённого аккаунта.">
      <Stack spacing={1.5} sx={styles.resetCard}>
        <Typography variant="body2" color="text.secondary">
          Настройки вернутся к значениям по умолчанию — бот выключится и снова уйдёт в сухой прогон. Библиотека,
          факты, диагностики, категории, заметки и плейбуки будут удалены: библиотека останется пустой, стандартную
          нужно будет загрузить заново. Вместе с ними исчезнут состояния чатов, ходы, черновики, события, алерты и
          статистика — бот забудет, о чём говорил с каждым лидом, и начнёт с приветствия. Переписка в Telegram, сами
          чаты и аккаунт останутся на месте. Отменить сброс нельзя.
        </Typography>
        <ConfirmAction
          question="Сбросить ИИ-агента аккаунта?"
          description="Настройки вернутся к значениям по умолчанию, а библиотека, факты, диагностики, категории, заметки, плейбуки, состояния чатов, ходы, черновики, события, алерты и статистика будут удалены. Это необратимо."
          confirmLabel="Сбросить всё"
          destructive
          onConfirm={() => void reset(accountId)}
        >
          {(ask) => (
            <Button
              type="button"
              color="error"
              variant="outlined"
              startIcon={<RestartAltIcon />}
              loading={isLoading}
              onClick={ask}
            >
              Сбросить всё по умолчанию
            </Button>
          )}
        </ConfirmAction>
        {data && <Alert severity="success">Агент сброшен. Удалено: {describe(data.deleted)}.</Alert>}
        {error && <Alert severity="error">{getApiErrorMessage(error, 'Не удалось сбросить агента')}</Alert>}
      </Stack>
    </SectionCard>
  )
}
