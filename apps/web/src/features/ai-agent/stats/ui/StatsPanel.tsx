import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { getApiErrorMessage } from '@/shared/lib'
import type { FunnelStage, TouchKind } from '@/shared/api'
import { FUNNEL_STAGE_META, TOUCH_KIND_META, TURN_TRIGGER_LABELS } from '@/entities/ai-agent'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'
import {
  draftStatusLabel,
  duration,
  percent,
  thousands,
  useGetDraftStatsQuery,
  useGetFunnelStatsQuery,
  useGetLibraryStatsQuery,
  useGetTurnStatsQuery,
} from '@/entities/ai-stats'

interface StatsPanelProps {
  accountId: string
}

const PERIODS = [
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
]

/**
 * Статистика аккаунта (раздел 12.1 п. 8 ТЗ): воронка, отклик на касания и
 * тексты, решения по черновикам, ходы. Считает backend по `ai_stats_daily`.
 */
export function StatsPanel({ accountId }: StatsPanelProps) {
  const [days, setDays] = useState(7)
  const query = { accountId, from: daysAgo(days) }
  const funnel = useGetFunnelStatsQuery(query)
  const turns = useGetTurnStatsQuery(query)
  const drafts = useGetDraftStatsQuery(query)
  const library = useGetLibraryStatsQuery(query)

  const error = funnel.error ?? turns.error ?? drafts.error ?? library.error
  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить статистику')}</Alert>

  const loading = funnel.isLoading || turns.isLoading || drafts.isLoading || library.isLoading
  if (loading) return <Skeleton variant="rounded" height={320} sx={{ borderRadius: 3 }} />

  const range = funnel.data?.range

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={days}
          onChange={(_, next: number | null) => next && setDays(next)}
        >
          {PERIODS.map((p) => (
            <ToggleButton key={p.days} value={p.days}>
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {range && (
          <Typography variant="caption" color="text.secondary">
            {range.from} — {range.to} (в таймзоне аккаунта). Пересчёт — раз в час, сегодняшний день считается при открытии.
          </Typography>
        )}
      </Stack>

      <Grid container spacing={2}>
        <Metric label="Новых лидов" value={thousands(funnel.data?.leads.started ?? 0)} hint="начали воронку за период" />
        <Metric
          label="Диагностик отправлено"
          value={thousands(funnel.data?.leads.diagnosticsSent ?? 0)}
          hint={`прочитали ${percent(funnel.data?.leads.diagnosticsReadRate ?? null)}`}
        />
        <Metric
          label="Медиана до диагностики"
          value={duration(funnel.data?.leads.medianMinutesToDiagnostics ?? null)}
          hint="от первого сообщения лида"
        />
        <Metric
          label="Передано менеджеру"
          value={thousands(turns.data?.handoff ?? 0)}
          hint={`${percent(turns.data?.handoffRate ?? null)} ходов`}
        />
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Typography sx={{ fontWeight: 600, mb: 1 }}>Воронка по этапам</Typography>
          {funnel.data && funnel.data.stages.length === 0 && <Empty />}
          {funnel.data && funnel.data.stages.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Этап</TableCell>
                  <TableCell align="right">Вошло</TableCell>
                  <TableCell align="right">Ушло дальше</TableCell>
                  <TableCell align="right">Менеджеру</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {funnel.data.stages.map((row) => (
                  <TableRow key={row.stage} hover>
                    <TableCell>{FUNNEL_STAGE_META[row.stage as FunnelStage]?.label ?? row.stage}</TableCell>
                    <TableCell align="right">{row.entered}</TableCell>
                    <TableCell align="right">{row.advanced}</TableCell>
                    <TableCell align="right">{row.handoff}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {funnel.data && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Вопрос-возврат после диагностики: отправлено {funnel.data.reengage.sent}, ответили {funnel.data.reengage.replied} (
              {percent(funnel.data.reengage.replyRate)}).
            </Typography>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Ходы</Typography>
              {turns.data && (
                <Stack spacing={0.5} sx={{ fontSize: 14 }}>
                  <Line label="Всего ходов" value={thousands(turns.data.total)} />
                  <Line label="Отправлено" value={`${thousands(turns.data.sent)} (+${thousands(turns.data.dryRun)} в сухом прогоне)`} />
                  <Line label="Промолчал" value={`${thousands(turns.data.silent)} · ${percent(turns.data.silentRate)}`} />
                  <Line label="Переписывал ответ" value={percent(turns.data.regeneratedRate)} />
                  <Line label="Ждут подтверждения" value={thousands(turns.data.awaitingApproval)} />
                  <Line label="Ошибок модели" value={thousands(turns.data.error)} />
                  <Line
                    label="Средняя уверенность"
                    value={turns.data.avgConfidence === null ? '—' : turns.data.avgConfidence.toFixed(2)}
                  />
                  <Line label="Токенов" value={`${thousands(turns.data.tokensIn)} вход · ${thousands(turns.data.tokensOut)} выход`} />
                </Stack>
              )}
              {turns.data && turns.data.handoffReasons.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Причины передач
                  </Typography>
                  <Stack spacing={0.25} sx={{ fontSize: 14, mt: 0.5 }}>
                    {turns.data.handoffReasons.map((item) => (
                      <Line
                        key={item.reason}
                        label={HANDOFF_REASON_LABELS[item.reason as keyof typeof HANDOFF_REASON_LABELS] ?? item.reason}
                        value={String(item.count)}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Черновики</Typography>
              {drafts.data && (
                <Stack spacing={0.5} sx={{ fontSize: 14 }}>
                  <Line label="Создано" value={thousands(drafts.data.created)} />
                  <Line label="Решено" value={thousands(drafts.data.decided)} />
                  {drafts.data.byStatus.map((row) => (
                    <Line key={row.status} label={draftStatusLabel(row.status)} value={`${row.count} · ${percent(row.share)}`} />
                  ))}
                  {drafts.data.decided === 0 && <Empty />}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Typography sx={{ fontWeight: 600, mb: 1 }}>Отклик: касания и тексты</Typography>
          <Typography variant="caption" color="text.secondary">
            «Ответили» — клиент написал в течение суток после хода.
          </Typography>
          {library.data && library.data.byKind.length === 0 && <Empty />}
          {library.data && library.data.byKind.length > 0 && (
            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Вид хода</TableCell>
                  <TableCell align="right">Отправлено</TableCell>
                  <TableCell align="right">Ответили</TableCell>
                  <TableCell align="right">Доля</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {library.data.byKind.map((row) => (
                  <TableRow key={row.kind} hover>
                    <TableCell>{touchLabel(row.kind)}</TableCell>
                    <TableCell align="right">{row.sent}</TableCell>
                    <TableCell align="right">{row.replied}</TableCell>
                    <TableCell align="right">{percent(row.replyRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {library.data && library.data.items.length > 0 && (
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Текст из библиотеки</TableCell>
                  <TableCell align="right">Отправлено</TableCell>
                  <TableCell align="right">Ответили</TableCell>
                  <TableCell align="right">Доля</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {library.data.items.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      {row.title}
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                        {row.kind}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{row.sent}</TableCell>
                    <TableCell align="right">{row.replied}</TableCell>
                    <TableCell align="right">{percent(row.replyRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Stack>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Grid size={{ xs: 6, md: 3 }}>
      <Card variant="outlined" sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography sx={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{value}</Typography>
          <Typography variant="caption" color="text.disabled">
            {hint}
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  )
}

function Empty() {
  return (
    <Typography variant="body2" color="text.secondary">
      За этот период данных нет.
    </Typography>
  )
}

/** Ключ строки — вид касания либо триггер хода (`inbound`, `manual`). */
function touchLabel(kind: string): string {
  return (
    TOUCH_KIND_META[kind as TouchKind] ??
    TURN_TRIGGER_LABELS[kind as keyof typeof TURN_TRIGGER_LABELS] ??
    kind
  )
}

function daysAgo(days: number): string {
  const at = new Date()
  at.setDate(at.getDate() - (days - 1))
  return at.toISOString().slice(0, 10)
}
