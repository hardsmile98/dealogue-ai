import { useState } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { formatDateTime, formatNumber, getApiErrorMessage, pluralize } from '@/shared/lib'
import type { StyleProfileDto } from '@/shared/api'
import {
  PHRASE_INTENT_LABELS,
  WEEKDAY_LABELS,
  formatDurationSec,
  useCancelLearningMutation,
  useGetLearningStatusQuery,
  useStartImportMutation,
  useStartLearningMutation,
  useUpdateProfileOverridesMutation,
} from '@/entities/ai-agent'

interface LearningPanelProps {
  accountId: string
}

const STAGE_LABELS: Record<string, string> = {
  collect: 'сбор диалогов',
  map: 'разбор диалогов моделью',
  reduce: 'сводка профиля',
  index: 'разметка примеров',
}

/** Обучение на истории: выгрузка, запуск дайджеста, просмотр и правка профиля. */
export function LearningPanel({ accountId }: LearningPanelProps) {
  const { data, isLoading, error } = useGetLearningStatusQuery(accountId, { pollingInterval: 5_000 })
  const [startImport, { isLoading: importing }] = useStartImportMutation()
  const [startLearning, { isLoading: starting }] = useStartLearningMutation()
  const [cancel, { isLoading: cancelling }] = useCancelLearningMutation()
  const [actionError, setActionError] = useState<string | null>(null)

  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить статус обучения')}</Alert>
  if (isLoading || !data) return <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />

  const { profile, importJob, digestJob, estimate } = data
  const importRunning = importJob?.status === 'running' || importJob?.status === 'queued'
  const building = profile.status === 'building' || digestJob?.status === 'running' || digestJob?.status === 'queued'
  const progress = importJob?.payload.progress

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null)
    try {
      await action()
    } catch (caught) {
      setActionError(getApiErrorMessage(caught))
    }
  }

  return (
    <Stack spacing={3}>
      {actionError && <Alert severity="error">{actionError}</Alert>}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          1. История переписок
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Обычная синхронизация хранит только последние сообщения каждого диалога. Для обучения нужна вся история —
          выгрузка идёт бережно, по одному диалогу, и продолжается после перезапуска.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <Button
            variant={data.deepHistoryStatus === 'done' ? 'outlined' : 'contained'}
            loading={importing || importRunning}
            disabled={building}
            onClick={() => void run(() => startImport(accountId).unwrap())}
          >
            {data.deepHistoryStatus === 'done' ? 'Догрузить историю ещё раз' : 'Загрузить всю историю'}
          </Button>
          <Typography variant="body2" color="text.secondary">
            {importRunning && progress
              ? `Выгружено ${progress.chatsDone ?? 0} из ${progress.chatsTotal ?? '?'} диалогов, ${formatNumber(progress.messages ?? 0)} сообщений`
              : data.deepHistoryStatus === 'done'
                ? `Выгружено. ${progress?.messages !== undefined ? `Сообщений: ${formatNumber(progress.messages)}` : ''}`
                : data.deepHistoryStatus === 'error'
                  ? `Ошибка выгрузки: ${importJob?.lastError ?? 'неизвестно'}`
                  : 'Ещё не выгружалась'}
          </Typography>
        </Stack>
        {importRunning && progress?.chatsTotal ? (
          <LinearProgress
            variant="determinate"
            value={Math.min(100, ((progress.chatsDone ?? 0) / progress.chatsTotal) * 100)}
            sx={{ mt: 2, borderRadius: 1 }}
          />
        ) : null}
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          2. Обучение
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          ИИ читает переписки менеджера и составляет профиль: как он пишет, какие фразы использует, что отвечает на
          частые вопросы и возражения, какие факты называет. Переписки отправляются провайдеру ИИ.
        </Typography>
        {estimate && !building && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 2 }}>
            <Chip size="small" label={`${pluralize(estimate.dialogs, ['диалог', 'диалога', 'диалогов'])} с ответами менеджера`} />
            <Chip size="small" label={`${pluralize(estimate.exchanges, ['обмен', 'обмена', 'обменов'])} «клиент → менеджер»`} />
            <Chip size="small" label={`≈ ${formatNumber(Math.round(estimate.chars / 3.5))} токенов на разбор`} />
            {estimate.thin && <Chip size="small" color="warning" label="мало данных — профиль будет приблизительным" />}
          </Stack>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          {building ? (
            <Button variant="outlined" color="warning" loading={cancelling} onClick={() => void run(() => cancel(accountId).unwrap())}>
              Остановить
            </Button>
          ) : (
            <Button
              variant="contained"
              loading={starting}
              disabled={importRunning || (estimate?.dialogs ?? 0) === 0}
              onClick={() => void run(() => startLearning(accountId).unwrap())}
            >
              {profile.status === 'ready' ? 'Переобучить' : 'Обучить на истории'}
            </Button>
          )}
          <Typography variant="body2" color="text.secondary">
            {building && profile.progress
              ? `${STAGE_LABELS[profile.progress.stage] ?? profile.progress.stage}: ${profile.progress.dialogsDone} из ${profile.progress.dialogsTotal}`
              : profile.status === 'ready' && profile.builtAt
                ? `Профиль v${profile.version} от ${formatDateTime(profile.builtAt)}`
                : profile.status === 'error'
                  ? `Ошибка: ${profile.error ?? digestJob?.lastError ?? 'неизвестно'}`
                  : (estimate?.dialogs ?? 0) === 0
                    ? 'Нет диалогов с ответами менеджера — сначала выгрузите историю'
                    : 'Профиль ещё не построен'}
          </Typography>
        </Stack>
        {building && profile.progress && profile.progress.dialogsTotal > 0 && (
          <LinearProgress
            variant="determinate"
            value={Math.min(100, (profile.progress.dialogsDone / profile.progress.dialogsTotal) * 100)}
            sx={{ mt: 2, borderRadius: 1 }}
          />
        )}
        {profile.error && profile.status !== 'error' && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Последняя попытка не удалась ({profile.error}) — очередь повторит автоматически.
          </Alert>
        )}
      </Paper>

      {profile.status === 'ready' && (
        <ProfileView
          // Новая версия или правки — форма пересобирается с актуальных значений.
          key={`${profile.version}:${JSON.stringify(profile.overrides)}`}
          accountId={accountId}
          profile={profile}
        />
      )}
    </Stack>
  )
}

function ProfileView({ accountId, profile }: { accountId: string; profile: StyleProfileDto }) {
  const [saveOverrides, { isLoading: saving }] = useUpdateProfileOverridesMutation()
  const [styleGuide, setStyleGuide] = useState(profile.effective.styleGuide)
  const [facts, setFacts] = useState(profile.effective.facts.join('\n'))
  const [saveError, setSaveError] = useState<string | null>(null)

  const dirty =
    styleGuide !== profile.effective.styleGuide ||
    facts.split('\n').map((s) => s.trim()).filter(Boolean).join('\n') !== profile.effective.facts.join('\n')

  const save = async () => {
    setSaveError(null)
    const nextFacts = facts.split('\n').map((s) => s.trim()).filter(Boolean)
    const overrides = {
      ...(profile.overrides ?? {}),
      ...(styleGuide !== profile.profile.styleGuide ? { styleGuide } : {}),
      ...(nextFacts.join('\n') !== profile.profile.facts.join('\n') ? { facts: nextFacts } : {}),
    }
    if (styleGuide === profile.profile.styleGuide) delete overrides.styleGuide
    if (nextFacts.join('\n') === profile.profile.facts.join('\n')) delete overrides.facts
    try {
      await saveOverrides({ accountId, overrides: Object.keys(overrides).length > 0 ? overrides : null }).unwrap()
    } catch (caught) {
      setSaveError(getApiErrorMessage(caught))
    }
  }

  const reset = async () => {
    setSaveError(null)
    try {
      await saveOverrides({ accountId, overrides: null }).unwrap()
    } catch (caught) {
      setSaveError(getApiErrorMessage(caught))
    }
  }

  const { habits, timing, phrasebook, faq, objections, dialogExemplars } = profile.effective
  const stats = profile.sourceStats

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        3. Что выучил ИИ
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {stats
          ? `На основе ${pluralize(stats.dialogs, ['диалога', 'диалогов', 'диалогов'])}, ${pluralize(stats.managerMessages, ['сообщения', 'сообщений', 'сообщений'])} менеджера${stats.from ? `, с ${formatDateTime(stats.from)}` : ''}.`
          : ''}{' '}
        Описание стиля и факты можно поправить — правки переживут переобучение.
      </Typography>
      {stats?.thin && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Диалогов мало, профиль приблизительный. ИИ будет больше опираться на скрипт из настроек.
        </Alert>
      )}

      <Stack spacing={2}>
        <TextField
          label="Как пишет менеджер"
          value={styleGuide}
          onChange={(e) => setStyleGuide(e.target.value)}
          multiline
          minRows={4}
          fullWidth
        />

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Chip size="small" label={`средняя длина ${habits.avgMessageLen} симв.`} />
          <Chip size="small" label={`несколько сообщений подряд: ${Math.round(habits.multiMessageShare * 100)}%`} />
          <Chip size="small" label={`с маленькой буквы: ${Math.round(habits.lowercaseStartShare * 100)}%`} />
          <Chip size="small" label={`без точки в конце: ${Math.round(habits.noTrailingPeriodShare * 100)}%`} />
          {habits.emojiTop.length > 0 && <Chip size="small" label={`эмодзи: ${habits.emojiTop.join(' ')}`} />}
          {habits.usesVoice && <Chip size="small" label="иногда голосовые" />}
          {habits.greetingPatterns.length > 0 && <Chip size="small" label={`приветствия: ${habits.greetingPatterns.join(', ')}`} />}
        </Stack>

        {timing && (
          <Typography variant="body2" color="text.secondary">
            Отвечает обычно через {formatDurationSec(timing.responseDelaySec.p50)} (половина ответов быстрее), в 90%
            случаев — не позже {formatDurationSec(timing.responseDelaySec.p90)}. Активен {timing.activeHours.from}:00–
            {timing.activeHours.to}:59 ({timing.tz}), дни: {timing.activeDays.map((d) => WEEKDAY_LABELS[d - 1]).join(', ')}. В
            эти часы ИИ и будет отвечать, если рабочие часы не заданы вручную.
          </Typography>
        )}

        <TextField
          label="Факты о продукте и условиях, которые называл менеджер"
          helperText="Проверьте цены и условия: устаревшее — удалите. По одному факту на строку."
          value={facts}
          onChange={(e) => setFacts(e.target.value)}
          multiline
          minRows={3}
          fullWidth
        />

        <Accordion variant="outlined" disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 600 }}>Библиотека фраз ({phrasebook.reduce((n, p) => n + p.phrases.length, 0)})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5}>
              {phrasebook.map((entry) => (
                <Box key={entry.intent}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                    {PHRASE_INTENT_LABELS[entry.intent]}
                  </Typography>
                  {entry.phrases.map((phrase, i) => (
                    <Typography key={i} sx={{ fontSize: 14, pl: 1.5, borderLeft: '2px solid', borderColor: 'divider', mb: 0.5 }}>
                      {phrase}
                    </Typography>
                  ))}
                </Box>
              ))}
              {phrasebook.length === 0 && <Typography variant="body2" color="text.secondary">Пусто</Typography>}
            </Stack>
          </AccordionDetails>
        </Accordion>

        <Accordion variant="outlined" disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 600 }}>Частые вопросы ({faq.length}) и возражения ({objections.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1}>
              {faq.map((item, i) => (
                <Box key={`q${i}`}>
                  <Typography component="div" sx={{ fontSize: 14, fontWeight: 600 }}>
                    {item.q} <Chip size="small" label={`×${item.seen}`} sx={{ ml: 0.5 }} />
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{item.a}</Typography>
                </Box>
              ))}
              {objections.map((item, i) => (
                <Box key={`o${i}`}>
                  <Typography component="div" sx={{ fontSize: 14, fontWeight: 600 }}>
                    «{item.objection}» <Chip size="small" label={`×${item.seen}`} sx={{ ml: 0.5 }} />
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>{item.answer}</Typography>
                </Box>
              ))}
              {faq.length + objections.length === 0 && <Typography variant="body2" color="text.secondary">Пусто</Typography>}
            </Stack>
          </AccordionDetails>
        </Accordion>

        {dialogExemplars.length > 0 && (
          <Accordion variant="outlined" disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 600 }}>Показательные диалоги ({dialogExemplars.length})</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={1}>
                {dialogExemplars.map((item, i) => (
                  <Typography key={i} component="div" sx={{ fontSize: 14 }}>
                    <Chip
                      size="small"
                      color={item.outcome === 'won' ? 'success' : item.outcome === 'lost' ? 'default' : 'info'}
                      label={item.outcome === 'won' ? 'сделка' : item.outcome === 'lost' ? 'отказ' : 'неизвестно'}
                      sx={{ mr: 1 }}
                    />
                    {item.summary}
                  </Typography>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        )}

        {saveError && <Alert severity="error">{saveError}</Alert>}
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          {profile.overrides && (
            <Button variant="text" loading={saving} onClick={() => void reset()}>
              Сбросить правки
            </Button>
          )}
          <Button variant="contained" disabled={!dirty} loading={saving} onClick={() => void save()}>
            Сохранить правки
          </Button>
        </Stack>
      </Stack>
    </Paper>
  )
}
