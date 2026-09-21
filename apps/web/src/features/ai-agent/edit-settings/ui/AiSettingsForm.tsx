import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Grid from '@mui/material/Grid'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined'
import { formatDateTime, getApiErrorMessage } from '@/shared/lib'
import { QueryBoundary, SectionCard } from '@/shared/ui'
import type {
  AiSettingsDto,
  GuardDto,
  LimitsDto,
  PersonaDto,
  TimingsDto,
  UpdateAiSettingsRequest,
} from '@/shared/api'
import {
  CHAT_MODE_META,
  useGetAiHealthQuery,
  useGetAiSettingsQuery,
  useUpdateAiSettingsMutation,
} from '@/entities/ai-agent'
import { aiSettingsStyles as styles } from './AiSettingsForm.styles'
import { ResetAgentCard } from './ResetAgentCard'

interface AiSettingsFormProps {
  accountId: string
}

/** Редактируемая копия настроек: ссылки и списки фраз — как многострочный текст. */
interface FormState {
  enabled: boolean
  dryRun: boolean
  defaultChatMode: 'auto' | 'supervised'
  assistantForExistingChats: boolean
  markRead: boolean
  notifyTelegram: boolean
  handoffPeer: string
  tz: string
  persona: Omit<PersonaDto, 'links'> & { linksText: string }
  timings: TimingsDto
  limits: LimitsDto
  guard: Omit<GuardDto, 'botAdmissionPhrases' | 'promisePhrases'> & {
    botAdmissionText: string
    promiseText: string
  }
}

function toForm(dto: AiSettingsDto): FormState {
  return {
    enabled: dto.enabled,
    dryRun: dto.dryRun,
    defaultChatMode: dto.defaultChatMode === 'supervised' ? 'supervised' : 'auto',
    assistantForExistingChats: dto.assistantForExistingChats,
    markRead: dto.markRead,
    notifyTelegram: dto.notifyTelegram,
    handoffPeer: dto.handoffPeer ?? '',
    tz: dto.tz,
    persona: {
      name: dto.persona.name,
      gender: dto.persona.gender,
      bio: dto.persona.bio,
      tone: dto.persona.tone,
      habits: dto.persona.habits,
      city: dto.persona.city,
      language: dto.persona.language,
      linksText: dto.persona.links.map((link) => `${link.title} | ${link.url}`).join('\n'),
    },
    timings: { ...dto.timings },
    limits: { ...dto.limits },
    guard: {
      similarityThreshold: dto.guard.similarityThreshold,
      confidenceThreshold: dto.guard.confidenceThreshold,
      botAdmissionText: dto.guard.botAdmissionPhrases.join('\n'),
      promiseText: dto.guard.promisePhrases.join('\n'),
    },
  }
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function toPatch(form: FormState): UpdateAiSettingsRequest {
  const { linksText, ...persona } = form.persona
  const { botAdmissionText, promiseText, ...guard } = form.guard
  return {
    enabled: form.enabled,
    dryRun: form.dryRun,
    defaultChatMode: form.defaultChatMode,
    assistantForExistingChats: form.assistantForExistingChats,
    markRead: form.markRead,
    notifyTelegram: form.notifyTelegram,
    handoffPeer: form.handoffPeer.trim() || null,
    tz: form.tz.trim(),
    persona: {
      ...persona,
      links: lines(linksText).map((line) => {
        const [title = '', url] = line.split('|').map((part) => part.trim())
        return { title, url: url || title }
      }),
    },
    timings: form.timings,
    limits: form.limits,
    guard: {
      ...guard,
      botAdmissionPhrases: lines(botAdmissionText),
      promisePhrases: lines(promiseText),
    },
  }
}

const TIMING_FIELDS: { key: keyof TimingsDto; label: string; hint: string }[] = [
  { key: 'debounceSec', label: 'Окно тишины, с', hint: 'сколько ждать после последнего сообщения клиента' },
  { key: 'debounceMaxSec', label: 'Максимум ожидания пачки, с', hint: 'от первого сообщения пачки' },
  { key: 'greetingDebounceMaxSec', label: 'Максимум ожидания на приветствии, с', hint: 'чтобы уложиться в 5 минут' },
  { key: 'firstReplyDelayMinSec', label: 'Первый ответ: от, с', hint: 'человеческая задержка' },
  { key: 'firstReplyDelayMaxSec', label: 'Первый ответ: до, с', hint: '' },
  { key: 'birthNudgeAfterMin', label: 'Напомнить про дату через, мин', hint: 'если клиент молчит' },
  { key: 'diagnosticsDelayMin', label: 'Диагностика через, мин', hint: 'после подтверждения запроса' },
  { key: 'reengageAfterReadMin', label: 'Вопрос-возврат после прочтения, мин', hint: '' },
  { key: 'reengageIfUnreadHours', label: 'Вопрос-возврат, если не прочитано, ч', hint: '' },
  { key: 'touchIntervalMinHours', label: 'Интервал касаний: от, ч', hint: '' },
  { key: 'touchIntervalMaxHours', label: 'Интервал касаний: до, ч', hint: '' },
  { key: 'maxReminders', label: 'Напоминаний после скидки', hint: '' },
  { key: 'superviseTimeoutHours', label: 'Ожидание подтверждения (supervised), ч', hint: '' },
]

const LIMIT_FIELDS: { key: keyof LimitsDto; label: string }[] = [
  { key: 'llmCallsPerHour', label: 'Вызовов модели в час' },
  { key: 'llmCallsPerDay', label: 'Вызовов модели в сутки' },
  { key: 'botMessagesPerHour', label: 'Сообщений бота в час' },
  { key: 'botMessagesPerChatPerDay', label: 'Сообщений бота в чат за сутки' },
  { key: 'autoMessagesWithoutReply', label: 'Сообщений подряд без ответа клиента' },
]

/** Настройки ИИ-агента аккаунта: включение, персона, таймеры, лимиты, guard, уведомления. */
export function AiSettingsForm({ accountId }: AiSettingsFormProps) {
  const query = useGetAiSettingsQuery(accountId, { skip: accountId === '' })

  return (
    <Stack spacing={2.5}>
      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить настройки ИИ"
        skeleton={
          <Stack spacing={2}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} variant="rounded" height={160} />
            ))}
          </Stack>
        }
      >
        {/* key по updatedAt: после сохранения форма пересоздаётся из свежих данных. */}
        {(data) => <SettingsEditor key={data.updatedAt} accountId={accountId} data={data} />}
      </QueryBoundary>
      <ResetAgentCard accountId={accountId} />
    </Stack>
  )
}

function SettingsEditor({ accountId, data }: { accountId: string; data: AiSettingsDto }) {
  const { data: health } = useGetAiHealthQuery()
  const [update, { isLoading: saving, error: saveError, isSuccess }] = useUpdateAiSettingsMutation()
  const [form, setForm] = useState<FormState>(() => toForm(data))

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const patchNested = <K extends 'persona' | 'timings' | 'limits' | 'guard'>(
    key: K,
    value: Partial<FormState[K]>,
  ) => setForm((prev) => ({ ...prev, [key]: { ...prev[key], ...value } }))

  const submit = () => {
    void update({ accountId, patch: toPatch(form) })
  }

  return (
    <Stack spacing={2.5} component="form" onSubmit={(event) => { event.preventDefault(); submit() }}>
      {form.dryRun && (
        <Alert severity="info" icon={<ScienceOutlinedIcon fontSize="inherit" />}>
          <strong>Сухой прогон.</strong> Бот проходит весь цикл и пишет в журнал, что отправил бы, но в Telegram
          ничего не уходит. Выключите, когда убедитесь, что ходы уместны.
        </Alert>
      )}
      {health && !health.ready && (
        <Alert severity="warning">
          Провайдер {health.provider} не готов: {health.enabled ? 'нет ключа в .env' : 'AI_ENABLED=false'}. Бот не
          будет делать ходов.
        </Alert>
      )}

      <SectionCard title="Включение">
        <Stack spacing={1}>
          <FormControlLabel
            control={<Switch checked={form.enabled} onChange={(e) => patch('enabled', e.target.checked)} />}
            label="Бот включён на аккаунте"
          />
          <FormControlLabel
            control={<Switch checked={form.dryRun} onChange={(e) => patch('dryRun', e.target.checked)} />}
            label="Сухой прогон (ничего не отправлять)"
          />
          <TextField
            select
            size="small"
            label="Режим для новых диалогов"
            value={form.defaultChatMode}
            onChange={(e) => patch('defaultChatMode', e.target.value as 'auto' | 'supervised')}
            helperText={CHAT_MODE_META[form.defaultChatMode].description}
            sx={styles.narrowField}
          >
            <MenuItem value="auto">{CHAT_MODE_META.auto.label}</MenuItem>
            <MenuItem value="supervised">{CHAT_MODE_META.supervised.label}</MenuItem>
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={form.assistantForExistingChats}
                onChange={(e) => patch('assistantForExistingChats', e.target.checked)}
              />
            }
            label="В старых чатах готовить черновики менеджеру (иначе бот их не трогает)"
          />
        </Stack>
      </SectionCard>

      <SectionCard title="Персона" subtitle="От чьего лица пишет бот. Тексты библиотеки должны совпадать по полу.">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Имя"
              value={form.persona.name}
              onChange={(e) => patchNested('persona', { name: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Пол"
              value={form.persona.gender}
              onChange={(e) => patchNested('persona', { gender: e.target.value as 'f' | 'm' })}
            >
              <MenuItem value="m">мужской</MenuItem>
              <MenuItem value="f">женский</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="Язык"
              value={form.persona.language}
              onChange={(e) => patchNested('persona', { language: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Город"
              value={form.persona.city}
              onChange={(e) => patchNested('persona', { city: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Тон"
              value={form.persona.tone}
              onChange={(e) => patchNested('persona', { tone: e.target.value })}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              minRows={3}
              size="small"
              label="Биография"
              helperText="Кто вы, откуда, чем занимаетесь — так, как рассказали бы клиенту."
              value={form.persona.bio}
              onChange={(e) => patchNested('persona', { bio: e.target.value })}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              label="Привычки письма"
              helperText="Эмодзи, скобочки, обращение на «вы», типичные обороты."
              value={form.persona.habits}
              onChange={(e) => patchNested('persona', { habits: e.target.value })}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              label="Ссылки"
              helperText="По одной на строку: «Instagram | https://…». Только эти ссылки бот может называть."
              value={form.persona.linksText}
              onChange={(e) => patchNested('persona', { linksText: e.target.value })}
            />
          </Grid>
        </Grid>
      </SectionCard>

      <SectionCard title="Таймеры" subtitle="Интервалы воронки. Касания получают случайный разброс автоматически.">
        <Grid container spacing={2}>
          {TIMING_FIELDS.map((field) => (
            <Grid key={field.key} size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label={field.label}
                helperText={field.hint || undefined}
                value={form.timings[field.key]}
                onChange={(e) => patchNested('timings', { [field.key]: Number(e.target.value) })}
              />
            </Grid>
          ))}
        </Grid>
      </SectionCard>

      <SectionCard title="Лимиты и проверки">
        <Grid container spacing={2}>
          {LIMIT_FIELDS.map((field) => (
            <Grid key={field.key} size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label={field.label}
                value={form.limits[field.key]}
                onChange={(e) => patchNested('limits', { [field.key]: Number(e.target.value) })}
              />
            </Grid>
          ))}
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Порог похожести на уже сказанное (0–1)"
              slotProps={{ htmlInput: { step: 0.05, min: 0.3, max: 1 } }}
              value={form.guard.similarityThreshold}
              onChange={(e) => patchNested('guard', { similarityThreshold: Number(e.target.value) })}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Минимальная уверенность модели (0–1)"
              slotProps={{ htmlInput: { step: 0.05, min: 0, max: 1 } }}
              value={form.guard.confidenceThreshold}
              onChange={(e) => patchNested('guard', { confidenceThreshold: Number(e.target.value) })}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              multiline
              minRows={4}
              size="small"
              label="Стоп-фразы: признания «я бот»"
              helperText="По одной на строку. Ответ с такой фразой переписывается."
              value={form.guard.botAdmissionText}
              onChange={(e) => patchNested('guard', { botAdmissionText: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              multiline
              minRows={4}
              size="small"
              label="Стоп-фразы: обещания результата"
              helperText="По одной на строку."
              value={form.guard.promiseText}
              onChange={(e) => patchNested('guard', { promiseText: e.target.value })}
            />
          </Grid>
        </Grid>
      </SectionCard>

      <SectionCard title="Уведомления и мелочи">
        <Stack spacing={1}>
          <FormControlLabel
            control={<Switch checked={form.markRead} onChange={(e) => patch('markRead', e.target.checked)} />}
            label="Отмечать входящие прочитанными перед ответом"
          />
          <FormControlLabel
            control={
              <Switch checked={form.notifyTelegram} onChange={(e) => patch('notifyTelegram', e.target.checked)} />
            }
            label="Дублировать передачи и черновики в Telegram"
          />
          <TextField
            size="small"
            label="Кому слать уведомления"
            helperText="@username или телефон; пусто — в «Избранное» аккаунта."
            value={form.handoffPeer}
            onChange={(e) => patch('handoffPeer', e.target.value)}
            sx={styles.narrowField}
          />
          <TextField
            size="small"
            label="Часовой пояс"
            helperText="IANA-зона: в ней считается статистика по дням."
            value={form.tz}
            onChange={(e) => patch('tz', e.target.value)}
            sx={styles.narrowField}
          />
        </Stack>
      </SectionCard>

      {saveError && <Alert severity="error">{getApiErrorMessage(saveError, 'Не удалось сохранить')}</Alert>}

      <Stack direction="row" spacing={2} sx={styles.footer}>
        <Button type="submit" variant="contained" loading={saving}>
          Сохранить
        </Button>
        {isSuccess && !saving && <Chip size="small" color="success" variant="outlined" label="Сохранено" />}
        <Typography variant="caption" color="text.secondary">
          Обновлено {formatDateTime(data.updatedAt)}
        </Typography>
      </Stack>
    </Stack>
  )
}
