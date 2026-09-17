import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import type { AiOverviewDto, LibraryOverviewDto } from '@/shared/api'
import { useGetLibraryOverviewQuery } from '@/entities/ai-library'

interface ReadinessCardProps {
  accountId: string
  overview: AiOverviewDto
}

interface Check {
  label: string
  state: 'ok' | 'warn' | 'todo'
  hint: string
}

/**
 * Приёмка перед включением на реальных лидах (раздел 18 ТЗ): что уже готово,
 * а что стоит доделать до выключения сухого прогона.
 */
export function ReadinessCard({ accountId, overview }: ReadinessCardProps) {
  const { data: library } = useGetLibraryOverviewQuery(accountId)
  const checks = buildChecks(overview, library)
  const left = checks.filter((c) => c.state !== 'ok').length

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography sx={{ fontWeight: 700, mb: 1 }}>
          Готовность к работе на реальных лидах {left === 0 ? '— всё готово' : `— осталось ${left}`}
        </Typography>
        <Stack spacing={0.75}>
          {checks.map((check) => (
            <Stack key={check.label} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              {check.state === 'ok' && <CheckCircleOutlineIcon fontSize="small" color="success" />}
              {check.state === 'warn' && <ErrorOutlineIcon fontSize="small" color="warning" />}
              {check.state === 'todo' && <RadioButtonUncheckedIcon fontSize="small" color="disabled" />}
              <Stack spacing={0}>
                <Typography variant="body2">{check.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {check.hint}
                </Typography>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}

function buildChecks(overview: AiOverviewDto, library?: LibraryOverviewDto): Check[] {
  const missingBlocks = library?.missingBlocks.length ?? 0
  const missingExamples = library?.missingExamples.length ?? 0
  const facts = library?.counts.facts ?? 0
  const diagnostics = library?.counts.diagnostics ?? 0
  const supervised = overview.chatsByMode.supervised ?? 0
  const auto = overview.chatsByMode.auto ?? 0

  return [
    {
      label: 'Провайдер отвечает',
      state: overview.provider.ready && !overview.provider.breakerOpen ? 'ok' : 'warn',
      hint: overview.provider.ready
        ? `${overview.provider.name}, модель ${overview.provider.model}`
        : 'Ключ не задан в .env — ходов не будет',
    },
    {
      label: 'Библиотека заполнена',
      state: missingBlocks === 0 ? (missingExamples === 0 ? 'ok' : 'warn') : 'warn',
      hint:
        missingBlocks === 0 && missingExamples === 0
          ? 'Обязательные блоки и образцы на месте'
          : `Не хватает блоков: ${missingBlocks}, образцов: ${missingExamples} — см. вкладку «Библиотека»`,
    },
    {
      label: 'Факты и диагностики заведены',
      state: facts > 0 && diagnostics > 0 ? 'ok' : 'warn',
      hint: `Фактов ${facts}, диагностик ${diagnostics}. Без фактов бот не говорит о ценах и сроках`,
    },
    {
      label: 'Обкатано под контролем',
      state: supervised + auto > 0 ? 'ok' : 'todo',
      hint:
        supervised + auto > 0
          ? `Чатов под ботом: ${supervised} под контролем, ${auto} автоматических`
          : 'Включите бота в тестовом чате и пройдите воронку до конца',
    },
    {
      label: 'Сухой прогон выключен',
      state: overview.dryRun ? 'todo' : 'ok',
      hint: overview.dryRun
        ? 'Пока включён: бот считает и пишет в журнал, но в Telegram ничего не уходит'
        : 'Бот пишет клиентам по-настоящему в чатах, где он включён',
    },
  ]
}
