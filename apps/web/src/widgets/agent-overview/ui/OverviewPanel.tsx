import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { accountLinks } from '@/shared/config'
import { formatDateTime, formatRelative } from '@/shared/lib'
import { ConfirmAction, QueryBoundary, SectionCard } from '@/shared/ui'
import { FUNNEL_STAGES } from '@/shared/api'
import type { ChatMode } from '@/shared/api'
import {
  CHAT_MODE_META,
  FUNNEL_STAGE_META,
  TOUCH_KIND_META,
  useGetAiOverviewQuery,
  useUpdateAiSettingsMutation,
} from '@/entities/ai-agent'
import { ReadinessCard } from './ReadinessCard'
import { agentOverviewStyles as styles } from './AgentOverview.styles'

interface OverviewPanelProps {
  accountId: string
}

const MODES = Object.keys(CHAT_MODE_META) as ChatMode[]

/** Обзор агента: включён ли, dry-run, чаты по режимам и этапам, ближайшие касания, ходы за день. */
export function OverviewPanel({ accountId }: OverviewPanelProps) {
  const query = useGetAiOverviewQuery(accountId, { pollingInterval: 30_000 })
  const [update, { isLoading: updating }] = useUpdateAiSettingsMutation()

  return (
    <QueryBoundary query={query} errorText="Не удалось загрузить обзор" skeleton={240}>
      {(data) => (
        <Stack spacing={2}>
          {!data.enabled && (
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  size="small"
                  loading={updating}
                  onClick={() => void update({ accountId, patch: { enabled: true } })}
                >
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
                <ConfirmAction
                  question="Выключить сухой прогон?"
                  description="Бот начнёт писать клиентам по-настоящему в чатах, где он включён."
                  confirmLabel="Выключить"
                  onConfirm={() => void update({ accountId, patch: { dryRun: false } })}
                >
                  {(ask) => (
                    <Button color="inherit" size="small" loading={updating} onClick={ask}>
                      Выключить dry-run
                    </Button>
                  )}
                </ConfirmAction>
              }
            >
              <strong>Сухой прогон.</strong> Бот проходит весь цикл, но в Telegram ничего не отправляет — «отправил
              бы» видно в чате пунктиром и в журнале ходов.
            </Alert>
          )}
          {!data.provider.ready && (
            <Alert severity="error">Провайдер {data.provider.name} не настроен: ключ не задан в .env.</Alert>
          )}
          {data.provider.breakerOpen && (
            <Alert severity="error">
              Провайдер {data.provider.name} временно недоступен — ходы откладываются.
            </Alert>
          )}

          <ReadinessCard accountId={accountId} overview={data} />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <SectionCard title="Чаты по режимам" fullHeight>
                <Stack spacing={0.75}>
                  {MODES.map((mode) => (
                    <Stack key={mode} direction="row" sx={styles.row}>
                      <Chip size="small" color={CHAT_MODE_META[mode].color} label={CHAT_MODE_META[mode].label} />
                      <Typography sx={styles.rowValue}>{data.chatsByMode[mode] ?? 0}</Typography>
                    </Stack>
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={styles.note}>
                  Новые лиды стартуют в режиме «{CHAT_MODE_META[data.defaultChatMode].label}». Открытых черновиков:{' '}
                  {data.pendingDrafts}.
                </Typography>
              </SectionCard>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <SectionCard title="Воронка (бот ведёт)" fullHeight>
                <Stack spacing={0.5} sx={styles.compactList}>
                  {FUNNEL_STAGES.map((stage) => (
                    <Stack key={stage} direction="row" sx={styles.row}>
                      <span>{FUNNEL_STAGE_META[stage].label}</span>
                      <strong>{data.chatsByStage[stage] ?? 0}</strong>
                    </Stack>
                  ))}
                </Stack>
              </SectionCard>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <SectionCard title="Ходы за сегодня" fullHeight>
                <Stack spacing={0.5} sx={styles.compactList}>
                  <Row label="Всего" value={data.turnsToday.total} />
                  <Row label="Отправлено" value={data.turnsToday.sent} />
                  <Row label="Сухой прогон" value={data.turnsToday.dryRun} />
                  <Row label="Передано менеджеру" value={data.turnsToday.handoff} />
                  <Row label="Ошибки" value={data.turnsToday.error} />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={styles.note}>
                  Модель {data.provider.model} ({data.provider.name}).
                </Typography>
              </SectionCard>
            </Grid>
          </Grid>

          <SectionCard title="Ближайшие касания">
            {data.upcomingTouches.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Запланированных касаний нет.
              </Typography>
            ) : (
              <Stack spacing={0.5}>
                {data.upcomingTouches.map((touch) => (
                  <Stack key={touch.chatId} direction="row" spacing={1} sx={styles.touch}>
                    <Button
                      size="small"
                      component={RouterLink}
                      to={accountLinks.chat(accountId, touch.chatId)}
                      sx={styles.touchLink}
                    >
                      {touch.peerName || 'чат'}
                    </Button>
                    <span>{TOUCH_KIND_META[touch.kind]}</span>
                    <Chip size="small" variant="outlined" label={FUNNEL_STAGE_META[touch.stage].short} />
                    <Box sx={styles.spacer} />
                    <Typography variant="caption" color="text.secondary" title={formatDateTime(touch.at)}>
                      {formatRelative(touch.at)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </SectionCard>
        </Stack>
      )}
    </QueryBoundary>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <Stack direction="row" sx={styles.row}>
      <span>{label}</span>
      <strong>{value}</strong>
    </Stack>
  )
}
