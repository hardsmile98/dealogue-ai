import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
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
import { daysAgoKey, formatMinutes, formatNumber, formatRate, getApiErrorMessage } from '@/shared/lib'
import { SectionCard, StatTile } from '@/shared/ui'
import type { DraftStatus, FunnelStage, TouchKind } from '@/shared/api'
import { FUNNEL_STAGE_META, TOUCH_KIND_META, TURN_TRIGGER_LABELS } from '@/entities/ai-agent'
import { DRAFT_STATUS_META } from '@/entities/ai-draft'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'
import {
  useGetDraftStatsQuery,
  useGetFunnelStatsQuery,
  useGetLibraryStatsQuery,
  useGetTurnStatsQuery,
} from '@/entities/ai-stats'
import { agentStatsStyles as styles } from './AgentStats.styles'

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
  const query = { accountId, from: daysAgoKey(days) }
  const funnel = useGetFunnelStatsQuery(query)
  const turns = useGetTurnStatsQuery(query)
  const drafts = useGetDraftStatsQuery(query)
  const library = useGetLibraryStatsQuery(query)

  // Четыре среза одного периода: показывать их порознь смысла нет —
  // пока не пришли все, панель неполная.
  const error = funnel.error ?? turns.error ?? drafts.error ?? library.error
  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить статистику')}</Alert>

  if (funnel.isLoading || turns.isLoading || drafts.isLoading || library.isLoading) {
    return <Skeleton variant="rounded" height={320} />
  }

  const range = funnel.data?.range

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={styles.periodBar}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={days}
          onChange={(_, next: number | null) => next && setDays(next)}
        >
          {PERIODS.map((period) => (
            <ToggleButton key={period.days} value={period.days}>
              {period.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {range && (
          <Typography variant="caption" color="text.secondary">
            {range.from} — {range.to} (в таймзоне аккаунта). Пересчёт — раз в час, сегодняшний день считается при
            открытии.
          </Typography>
        )}
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile
            label="Новых лидов"
            value={formatNumber(funnel.data?.leads.started ?? 0)}
            caption="начали воронку за период"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile
            label="Диагностик отправлено"
            value={formatNumber(funnel.data?.leads.diagnosticsSent ?? 0)}
            caption={`прочитали ${formatRate(funnel.data?.leads.diagnosticsReadRate)}`}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile
            label="Медиана до диагностики"
            value={formatMinutes(funnel.data?.leads.medianMinutesToDiagnostics)}
            caption="от первого сообщения лида"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <StatTile
            label="Передано менеджеру"
            value={formatNumber(turns.data?.handoff ?? 0)}
            caption={`${formatRate(turns.data?.handoffRate)} ходов`}
          />
        </Grid>
      </Grid>

      <SectionCard title="Воронка по этапам">
        {funnel.data && funnel.data.stages.length === 0 && <NoData />}
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
          <Typography variant="caption" color="text.secondary" sx={styles.note}>
            Вопрос-возврат после диагностики: отправлено {funnel.data.reengage.sent}, ответили{' '}
            {funnel.data.reengage.replied} ({formatRate(funnel.data.reengage.replyRate)}).
          </Typography>
        )}
      </SectionCard>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <SectionCard title="Ходы" fullHeight>
            {turns.data && (
              <Stack spacing={0.5}>
                <Line label="Всего ходов" value={formatNumber(turns.data.total)} />
                <Line
                  label="Отправлено"
                  value={`${formatNumber(turns.data.sent)} (+${formatNumber(turns.data.dryRun)} в сухом прогоне)`}
                />
                <Line
                  label="Промолчал"
                  value={`${formatNumber(turns.data.silent)} · ${formatRate(turns.data.silentRate)}`}
                />
                <Line label="Переписывал ответ" value={formatRate(turns.data.regeneratedRate)} />
                <Line label="Ждут подтверждения" value={formatNumber(turns.data.awaitingApproval)} />
                <Line label="Ошибок модели" value={formatNumber(turns.data.error)} />
                <Line
                  label="Средняя уверенность"
                  value={turns.data.avgConfidence === null ? '—' : turns.data.avgConfidence.toFixed(2)}
                />
                <Line
                  label="Токенов"
                  value={`${formatNumber(turns.data.tokensIn)} вход · ${formatNumber(turns.data.tokensOut)} выход`}
                />
              </Stack>
            )}
            {turns.data && turns.data.handoffReasons.length > 0 && (
              <Box sx={styles.subSection}>
                <Typography variant="caption" color="text.secondary">
                  Причины передач
                </Typography>
                <Stack spacing={0.25} sx={styles.subList}>
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
          </SectionCard>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <SectionCard title="Черновики" fullHeight>
            {drafts.data && (
              <Stack spacing={0.5}>
                <Line label="Создано" value={formatNumber(drafts.data.created)} />
                <Line label="Решено" value={formatNumber(drafts.data.decided)} />
                {drafts.data.byStatus.map((row) => (
                  <Line
                    key={row.status}
                    label={DRAFT_STATUS_META[row.status as DraftStatus]?.label ?? row.status}
                    value={`${row.count} · ${formatRate(row.share)}`}
                  />
                ))}
                {drafts.data.decided === 0 && <NoData />}
              </Stack>
            )}
          </SectionCard>
        </Grid>
      </Grid>

      <SectionCard
        title="Отклик: касания и тексты"
        subtitle="«Ответили» — клиент написал в течение суток после хода."
      >
        {library.data && library.data.byKind.length === 0 && <NoData />}
        {library.data && library.data.byKind.length > 0 && (
          <Table size="small">
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
                  <TableCell align="right">{formatRate(row.replyRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {library.data && library.data.items.length > 0 && (
          <Table size="small" sx={styles.secondTable}>
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
                    <Typography variant="caption" color="text.disabled" sx={styles.itemKind}>
                      {row.kind}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{row.sent}</TableCell>
                  <TableCell align="right">{row.replied}</TableCell>
                  <TableCell align="right">{formatRate(row.replyRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </Stack>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={1} sx={styles.line}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  )
}

function NoData() {
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
