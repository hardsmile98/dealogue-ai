import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { accountLinks } from '@/shared/config'
import { formatDateTime, formatRelative, getApiErrorMessage } from '@/shared/lib'
import { FUNNEL_STAGES } from '@/shared/api'
import type { ChatMode } from '@/shared/api'
import { CHAT_MODE_META, FUNNEL_STAGE_META, TOUCH_KIND_META, useGetAiOverviewQuery, useUpdateAiSettingsMutation } from '@/entities/ai-agent'
import { ReadinessCard } from './ReadinessCard'

interface OverviewPanelProps {
  accountId: string
}

/** Обзор агента: включён ли, dry-run, чаты по режимам и этапам, ближайшие касания, ходы за день. */
export function OverviewPanel({ accountId }: OverviewPanelProps) {
  const { data, isLoading, error } = useGetAiOverviewQuery(accountId, { pollingInterval: 30_000 })
  const [update, { isLoading: updating }] = useUpdateAiSettingsMutation()

  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить обзор')}</Alert>
  if (isLoading || !data) return <Skeleton variant="rounded" height={240} sx={{ borderRadius: 3 }} />

  const modes = Object.keys(CHAT_MODE_META) as ChatMode[]

  return (
    <Stack spacing={2}>
      {!data.enabled && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" loading={updating} onClick={() => void update({ accountId, patch: { enabled: true } })}>
              Включить
            </Button>
          }
        >
          <strong>ИИ-агент выключен на аккаунте.</strong> Входящие не обрабатываются, касаний нет.
        </Alert>
      )}
      {data.enabled && data.dryRun && (
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              loading={updating}
              onClick={() => {
                if (window.confirm('Выключить сухой прогон? Бот начнёт писать клиентам по-настоящему в чатах, где он включён.')) {
                  void update({ accountId, patch: { dryRun: false } })
                }
              }}
            >
              Выключить dry-run
            </Button>
          }
        >
          <strong>Сухой прогон.</strong> Бот проходит весь цикл, но в Telegram ничего не отправляет — «отправил бы» видно в чате пунктиром и в журнале ходов.
        </Alert>
      )}
      {!data.provider.ready && <Alert severity="error">Провайдер {data.provider.name} не настроен: ключ не задан в .env.</Alert>}
      {data.provider.breakerOpen && <Alert severity="error">Провайдер {data.provider.name} временно недоступен — ходы откладываются.</Alert>}

      <ReadinessCard accountId={accountId} overview={data} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>Чаты по режимам</Typography>
              <Stack spacing={0.75}>
                {modes.map((mode) => (
                  <Stack key={mode} direction="row" sx={{ justifyContent: 'space-between' }}>
                    <Chip size="small" color={CHAT_MODE_META[mode].color} label={CHAT_MODE_META[mode].label} />
                    <Typography sx={{ fontWeight: 600 }}>{data.chatsByMode[mode] ?? 0}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Новые лиды стартуют в режиме «{CHAT_MODE_META[data.defaultChatMode].label}». Открытых черновиков: {data.pendingDrafts}.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>Воронка (бот ведёт)</Typography>
              <Stack spacing={0.5}>
                {FUNNEL_STAGES.map((stage) => (
                  <Stack key={stage} direction="row" sx={{ justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{FUNNEL_STAGE_META[stage].label}</span>
                    <strong>{data.chatsByStage[stage] ?? 0}</strong>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>Ходы за сегодня</Typography>
              <Stack spacing={0.5} sx={{ fontSize: 13 }}>
                <Row label="Всего" value={data.turnsToday.total} />
                <Row label="Отправлено" value={data.turnsToday.sent} />
                <Row label="Сухой прогон" value={data.turnsToday.dryRun} />
                <Row label="Передано менеджеру" value={data.turnsToday.handoff} />
                <Row label="Ошибки" value={data.turnsToday.error} />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Модель {data.provider.model} ({data.provider.name}).
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Ближайшие касания</Typography>
          {data.upcomingTouches.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Запланированных касаний нет.
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {data.upcomingTouches.map((touch) => (
                <Stack key={touch.chatId} direction="row" spacing={1} sx={{ alignItems: 'center', fontSize: 13 }}>
                  <Button size="small" component={RouterLink} to={accountLinks.chat(accountId, touch.chatId)} sx={{ minWidth: 0, textTransform: 'none' }}>
                    {touch.peerName || 'чат'}
                  </Button>
                  <span>{TOUCH_KIND_META[touch.kind]}</span>
                  <Chip size="small" variant="outlined" label={FUNNEL_STAGE_META[touch.stage].short} />
                  <Box sx={{ flexGrow: 1 }} />
                  <Typography variant="caption" color="text.secondary" title={formatDateTime(touch.at)}>
                    {formatRelative(touch.at)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
      <span>{label}</span>
      <strong>{value}</strong>
    </Stack>
  )
}
