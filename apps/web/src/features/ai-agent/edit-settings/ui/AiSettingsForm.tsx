import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { formatRelative, getApiErrorMessage } from '@/shared/lib'
import type { AiSettingsDto, UpdateAiSettingsRequest, WorkingHoursDto } from '@/shared/api'
import type { SxStyles } from '@/shared/types'
import {
  WEEKDAY_LABELS,
  useGetAiProvidersQuery,
  useGetAiSettingsQuery,
  useUpdateAiSettingsMutation,
} from '@/entities/ai-agent'
import { FollowupsEditor, PairListEditor, StagesEditor, StringListEditor } from './editors'

interface AiSettingsFormProps {
  accountId: string
}

type FormState = Omit<AiSettingsDto, 'accountId' | 'updatedAt'>

const DEFAULT_HOURS: WorkingHoursDto = {
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
  days: [1, 2, 3, 4, 5],
  from: '09:00',
  to: '21:00',
}

function toForm(settings: AiSettingsDto): FormState {
  const { accountId: _a, updatedAt: _u, ...rest } = settings
  return rest
}

/** Все настройки ИИ-агента аккаунта: общее, скрипт, поведение, передача, дожимы. */
export function AiSettingsForm({ accountId }: AiSettingsFormProps) {
  const { data: settings, isLoading, error } = useGetAiSettingsQuery(accountId)

  if (error) return <Alert severity="error">{getApiErrorMessage(error, 'Не удалось загрузить настройки')}</Alert>
  if (isLoading || !settings) return <Skeleton variant="rounded" height={320} sx={{ borderRadius: 3 }} />

  // Пересобираем форму, когда с сервера пришла новая версия (после сохранения).
  return <SettingsFormInner key={settings.updatedAt} accountId={accountId} settings={settings} />
}

function SettingsFormInner({ accountId, settings }: { accountId: string; settings: AiSettingsDto }) {
  const { data: providers } = useGetAiProvidersQuery()
  const [save, { isLoading: saving }] = useUpdateAiSettingsMutation()
  const [form, setForm] = useState<FormState>(() => toForm(settings))
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const dirty = useMemo(() => JSON.stringify(toForm(settings)) !== JSON.stringify(form), [settings, form])

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const patchScript = <K extends keyof FormState['script']>(key: K, value: FormState['script'][K]) =>
    setForm((prev) => ({ ...prev, script: { ...prev.script, [key]: value } }))

  const submit = async () => {
    setSaveError(null)
    try {
      const body: UpdateAiSettingsRequest = {
        ...form,
        script: {
          ...form.script,
          facts: clean(form.script.facts),
          forbidden: clean(form.script.forbidden),
          pinnedStyleExamples: clean(form.script.pinnedStyleExamples),
          stages: form.script.stages.map((s) => ({ ...s, templates: clean(s.templates) })),
          faq: form.script.faq.filter((f) => f.q.trim() && f.a.trim()),
          objections: form.script.objections.filter((o) => o.objection.trim() && o.answer.trim()),
        },
      }
      await save({ accountId, patch: body }).unwrap()
      setSavedAt(Date.now())
    } catch (caught) {
      setSaveError(getApiErrorMessage(caught))
    }
  }

  const selectedProvider = providers?.providers.find((p) => p.name === (form.provider ?? ''))
  const models = selectedProvider?.models ?? []
  const providerConfigured = form.provider ? (selectedProvider?.configured ?? true) : true

  return (
    <Stack spacing={3}>
      <Section title="Общее">
        <FormControlLabel
          control={<Switch checked={form.enabled} onChange={(e) => patch('enabled', e.target.checked)} />}
          label="ИИ разрешён на этом аккаунте"
        />
        <Typography variant="body2" color="text.secondary">
          Даже с включённым флагом ИИ отвечает только в тех чатах, где его включили вручную. Переписка этих чатов
          отправляется провайдеру ИИ (DeepSeek — зарубежный сервис).
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            select
            label="Провайдер"
            value={form.provider ?? ''}
            onChange={(e) => patch('provider', e.target.value || null)}
            size="small"
            sx={{ minWidth: 220 }}
            helperText={!providerConfigured ? 'Ключ этого провайдера не задан в .env' : 'Пусто — из настроек сервера'}
            error={!providerConfigured}
          >
            <MenuItem value="">По умолчанию ({providers?.providers.find((p) => p.isDefault)?.name ?? '—'})</MenuItem>
            {providers?.providers.map((p) => (
              <MenuItem key={p.name} value={p.name}>
                {p.name}
                {!p.configured && ' (ключ не задан)'}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select={models.length > 0}
            label="Модель"
            value={form.model ?? ''}
            onChange={(e) => patch('model', e.target.value || null)}
            size="small"
            sx={{ minWidth: 220 }}
            helperText={`Пусто — ${providers?.defaultModel ?? 'по умолчанию'}`}
          >
            {models.length > 0 && <MenuItem value="">По умолчанию</MenuItem>}
            {models.map((m) => (
              <MenuItem key={m} value={m}>
                {m}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <FormControlLabel
          control={<Switch checked={form.useLearnedStyle} onChange={(e) => patch('useLearnedStyle', e.target.checked)} />}
          label="Использовать выученный из истории стиль и похожие прошлые ответы"
        />
        <TextField
          label="Сколько похожих прошлых ответов подмешивать"
          type="number"
          value={form.retrievalExamples}
          onChange={(e) => patch('retrievalExamples', Number(e.target.value))}
          size="small"
          slotProps={{ htmlInput: { min: 0, max: 20 } }}
          sx={{ maxWidth: 320 }}
          disabled={!form.useLearnedStyle}
        />
      </Section>

      <Section title="Скрипт продаж" subtitle="Имеет приоритет над тем, что ИИ вывел из истории.">
        <TextField
          label="От чьего лица и что продаём"
          value={form.script.persona}
          onChange={(e) => patchScript('persona', e.target.value)}
          multiline
          minRows={2}
          fullWidth
          placeholder="Менеджер Анна, онлайн-школа английского для взрослых"
        />
        <TextField
          label="Тон (уточнение к выученному стилю)"
          value={form.script.tone}
          onChange={(e) => patchScript('tone', e.target.value)}
          multiline
          fullWidth
        />
        <Typography sx={{ fontWeight: 600 }}>Этапы воронки</Typography>
        <StagesEditor value={form.script.stages} onChange={(stages) => patchScript('stages', stages)} />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            select
            label="Этап передачи менеджеру"
            value={form.script.handoffStageKey}
            onChange={(e) => patchScript('handoffStageKey', e.target.value)}
            size="small"
            sx={{ minWidth: 260 }}
          >
            {form.script.stages.map((s) => (
              <MenuItem key={s.key} value={s.key}>
                {s.name} ({s.key})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Что писать клиенту при передаче"
            value={form.script.handoffTemplate}
            onChange={(e) => patchScript('handoffTemplate', e.target.value)}
            size="small"
            fullWidth
            multiline
          />
        </Stack>
        <StringListEditor
          label="Факты о продукте и условиях"
          helper="Единственный источник цен, сроков и ссылок для ИИ. Чего здесь нет — он не обещает."
          value={form.script.facts}
          onChange={(facts) => patchScript('facts', facts)}
          rows={5}
        />
        <PairListEditor
          title="Частые вопросы"
          value={form.script.faq}
          onChange={(faq) => patchScript('faq', faq)}
          leftKey="q"
          rightKey="a"
          leftLabel="Вопрос клиента"
          rightLabel="Ответ"
          empty={{ q: '', a: '' }}
        />
        <PairListEditor
          title="Возражения"
          value={form.script.objections}
          onChange={(objections) => patchScript('objections', objections)}
          leftKey="objection"
          rightKey="answer"
          leftLabel="Возражение"
          rightLabel="Как отрабатываем"
          empty={{ objection: '', answer: '' }}
        />
        <StringListEditor
          label="Запрещено"
          helper="Темы и формулировки, которых ИИ должен избегать"
          value={form.script.forbidden}
          onChange={(forbidden) => patchScript('forbidden', forbidden)}
          rows={3}
        />
        <StringListEditor
          label="Ручные примеры стиля"
          helper="Фразы, которые точно должны звучать как менеджер — идут первыми среди примеров"
          value={form.script.pinnedStyleExamples}
          onChange={(v) => patchScript('pinnedStyleExamples', v)}
          rows={3}
        />
      </Section>

      <Section title="Поведение">
        <Box sx={styles.fieldGrid}>
          <NumberField
            label="Пауза после сообщения клиента"
            unit="сек"
            helper="Ждём, не допишет ли клиент ещё"
            value={form.debounceSec}
            min={5}
            max={600}
            onChange={(v) => patch('debounceSec', v)}
          />
          <NumberField
            label="Потолок задержки ответа"
            unit="сек"
            helper="Сама задержка — из выученного времени реакции менеджера"
            value={form.replyDelayCapSec}
            min={15}
            max={3600}
            onChange={(v) => patch('replyDelayCapSec', v)}
          />
          <NumberField
            label="Сообщений истории в контексте"
            unit="шт."
            helper="Сколько последних сообщений видит модель"
            value={form.contextMessages}
            min={4}
            max={100}
            onChange={(v) => patch('contextMessages', v)}
          />
          <NumberField
            label="Лимит сообщений ИИ в чате"
            unit="шт."
            helper="После него ИИ останавливается и зовёт менеджера"
            value={form.maxAiMessagesPerChat}
            min={1}
            max={500}
            onChange={(v) => patch('maxAiMessagesPerChat', v)}
          />
          <NumberField
            label="Лимит сообщений ИИ в день"
            unit="шт."
            helper="На весь аккаунт, включая дожимы"
            value={form.maxAiMessagesPerDay}
            min={1}
            max={5000}
            onChange={(v) => patch('maxAiMessagesPerDay', v)}
          />
        </Box>
        <FormControlLabel
          control={<Switch checked={form.markRead} onChange={(e) => patch('markRead', e.target.checked)} />}
          label="Отмечать сообщения прочитанными перед ответом"
        />
        <Divider />
        <FormControlLabel
          control={
            <Switch
              checked={form.workingHours !== null}
              onChange={(e) => patch('workingHours', e.target.checked ? DEFAULT_HOURS : null)}
            />
          }
          label="Рабочие часы вручную (иначе — из выученной активности менеджера)"
        />
        {form.workingHours && (
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Часовой пояс"
                value={form.workingHours.tz}
                onChange={(e) => patch('workingHours', { ...form.workingHours!, tz: e.target.value })}
                size="small"
              />
              <TextField
                label="С"
                type="time"
                value={form.workingHours.from}
                onChange={(e) => patch('workingHours', { ...form.workingHours!, from: e.target.value })}
                size="small"
              />
              <TextField
                label="До"
                type="time"
                value={form.workingHours.to}
                onChange={(e) => patch('workingHours', { ...form.workingHours!, to: e.target.value })}
                size="small"
              />
            </Stack>
            <Stack direction="row" spacing={0} sx={{ flexWrap: 'wrap' }}>
              {WEEKDAY_LABELS.map((label, i) => {
                const day = i + 1
                const checked = form.workingHours!.days.includes(day)
                return (
                  <FormControlLabel
                    key={day}
                    control={
                      <Checkbox
                        size="small"
                        checked={checked}
                        onChange={(e) => {
                          const days = e.target.checked
                            ? [...form.workingHours!.days, day].sort()
                            : form.workingHours!.days.filter((d) => d !== day)
                          patch('workingHours', { ...form.workingHours!, days })
                        }}
                      />
                    }
                    label={label}
                  />
                )
              })}
            </Stack>
          </Stack>
        )}
      </Section>

      <Section title="Передача менеджеру">
        <FormControlLabel
          control={<Switch checked={form.pauseOnHandoff} onChange={(e) => patch('pauseOnHandoff', e.target.checked)} />}
          label="Останавливать ИИ в чате, когда клиент готов к оплате"
        />
        <FormControlLabel
          control={<Switch checked={form.notifyTelegram} onChange={(e) => patch('notifyTelegram', e.target.checked)} />}
          label="Присылать уведомление в Telegram"
        />
        <TextField
          label="Кому слать уведомления"
          value={form.handoffPeer ?? ''}
          onChange={(e) => patch('handoffPeer', e.target.value || null)}
          size="small"
          helperText="@username или телефон. Пусто — в «Избранное» этого аккаунта."
          sx={{ maxWidth: 360 }}
          disabled={!form.notifyTelegram}
        />
      </Section>

      <Section title="Дожимы" subtitle="Если клиент замолчал после нашего ответа, ИИ напомнит о себе по шагам.">
        <FormControlLabel
          control={<Switch checked={form.followupsEnabled} onChange={(e) => patch('followupsEnabled', e.target.checked)} />}
          label="Дожимать молчащих клиентов"
        />
        <FollowupsEditor value={form.followups} onChange={(followups) => patch('followups', followups)} />
        <Typography variant="body2" color="text.secondary">
          Серия сбрасывается, как только клиент ответит; останавливается, если он просит не писать, или по кнопке в чате.
        </Typography>
      </Section>

      {saveError && <Alert severity="error">{saveError}</Alert>}

      <Paper elevation={dirty ? 6 : 0} sx={[styles.actionBar, dirty && styles.actionBarDirty]}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          {dirty ? (
            <>
              <EditOutlinedIcon fontSize="small" color="primary" />
              <Typography sx={styles.actionStatus}>Есть несохранённые изменения</Typography>
            </>
          ) : (
            <>
              <CheckCircleOutlinedIcon fontSize="small" color="success" />
              <Typography sx={styles.actionStatus}>
                {savedAt ? 'Сохранено' : `Сохранено ${formatRelative(settings.updatedAt)}`}
              </Typography>
            </>
          )}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" disabled={!dirty || saving} onClick={() => setForm(toForm(settings))}>
            Отменить
          </Button>
          <Button variant="contained" disabled={!dirty} loading={saving} onClick={() => void submit()}>
            Сохранить
          </Button>
        </Stack>
      </Paper>
    </Stack>
  )
}

const styles = {
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
    gap: 2,
    alignItems: 'start',
  },
  actionBar: {
    position: 'sticky',
    bottom: 16,
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
    flexWrap: 'wrap',
    px: 2.5,
    py: 1.5,
    borderRadius: 3,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    transition: 'box-shadow 160ms ease, border-color 160ms ease',
  },
  actionBarDirty: {
    borderColor: 'primary.main',
  },
  actionStatus: {
    fontSize: 14,
    fontWeight: 500,
    color: 'text.secondary',
    whiteSpace: 'nowrap',
  },
} satisfies SxStyles

function clean(items: string[]): string[] {
  return items.map((s) => s.trim()).filter(Boolean)
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Typography variant="h6" sx={{ mb: subtitle ? 0.5 : 2 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {subtitle}
        </Typography>
      )}
      <Stack spacing={2}>{children}</Stack>
    </Paper>
  )
}

function NumberField({
  label,
  unit,
  helper,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  unit?: string
  helper?: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <TextField
      label={label}
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      size="small"
      fullWidth
      helperText={helper}
      slotProps={{
        htmlInput: { min, max },
        input: unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : undefined,
      }}
    />
  )
}
