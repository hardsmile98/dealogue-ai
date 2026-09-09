import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import type { FollowupStepDto, StageDto } from '@/shared/api'

interface StringListEditorProps {
  label: string
  helper?: string
  value: string[]
  onChange: (next: string[]) => void
  rows?: number
  placeholder?: string
}

/** Список строк — одно значение на строку textarea. */
export function StringListEditor({ label, helper, value, onChange, rows = 4, placeholder }: StringListEditorProps) {
  return (
    <TextField
      label={label}
      helperText={helper ?? 'По одному пункту на строку'}
      value={value.join('\n')}
      onChange={(event) => onChange(event.target.value.split('\n'))}
      onBlur={() => onChange(value.map((v) => v.trim()).filter(Boolean))}
      multiline
      minRows={rows}
      fullWidth
      placeholder={placeholder}
    />
  )
}

interface PairListEditorProps<T> {
  title: string
  helper?: string
  value: T[]
  onChange: (next: T[]) => void
  leftKey: keyof T & string
  rightKey: keyof T & string
  leftLabel: string
  rightLabel: string
  empty: T
}

/** Список пар «вопрос → ответ» / «возражение → ответ». */
export function PairListEditor<T extends Record<string, string>>({
  title,
  helper,
  value,
  onChange,
  leftKey,
  rightKey,
  leftLabel,
  rightLabel,
  empty,
}: PairListEditorProps<T>) {
  const update = (index: number, key: keyof T & string, next: string) => {
    onChange(value.map((item, i) => (i === index ? { ...item, [key]: next } : item)))
  }
  return (
    <Box>
      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{title}</Typography>
      {helper && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {helper}
        </Typography>
      )}
      <Stack spacing={1.5}>
        {value.map((item, index) => (
          <Stack key={index} direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'flex-start' } }}>
            <TextField
              label={leftLabel}
              value={item[leftKey]}
              onChange={(event) => update(index, leftKey, event.target.value)}
              fullWidth
              size="small"
              multiline
            />
            <TextField
              label={rightLabel}
              value={item[rightKey]}
              onChange={(event) => update(index, rightKey, event.target.value)}
              fullWidth
              size="small"
              multiline
            />
            <IconButton aria-label="Удалить" onClick={() => onChange(value.filter((_, i) => i !== index))}>
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...value, empty])} sx={{ alignSelf: 'flex-start' }}>
          Добавить
        </Button>
      </Stack>
    </Box>
  )
}

interface StagesEditorProps {
  value: StageDto[]
  onChange: (next: StageDto[]) => void
}

/** Этапы воронки: ключ, название, цель, опорные фразы. */
export function StagesEditor({ value, onChange }: StagesEditorProps) {
  const update = (index: number, patch: Partial<StageDto>) => {
    onChange(value.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)))
  }
  const move = (index: number, delta: number) => {
    const next = [...value]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return (
    <Stack spacing={2}>
      {value.map((stage, index) => (
        <Box key={index} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1 }}>
            <TextField
              label="Ключ"
              value={stage.key}
              onChange={(event) => update(index, { key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
              size="small"
              helperText="латиница, цифры, _"
              sx={{ minWidth: 160 }}
            />
            <TextField
              label="Название"
              value={stage.name}
              onChange={(event) => update(index, { name: event.target.value })}
              size="small"
              fullWidth
            />
            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
              <Button size="small" onClick={() => move(index, -1)} disabled={index === 0}>
                ↑
              </Button>
              <Button size="small" onClick={() => move(index, 1)} disabled={index === value.length - 1}>
                ↓
              </Button>
              <IconButton aria-label="Удалить этап" onClick={() => onChange(value.filter((_, i) => i !== index))}>
                <DeleteOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
          <Stack spacing={1}>
            <TextField
              label="Цель этапа"
              value={stage.goal}
              onChange={(event) => update(index, { goal: event.target.value })}
              size="small"
              fullWidth
              multiline
            />
            <TextField
              label="Когда переходить дальше"
              value={stage.advanceWhen ?? ''}
              onChange={(event) => update(index, { advanceWhen: event.target.value || undefined })}
              size="small"
              fullWidth
            />
            <StringListEditor
              label="Опорные фразы"
              helper="Как менеджер обычно говорит на этом этапе — по одной фразе на строку"
              value={stage.templates}
              onChange={(templates) => update(index, { templates })}
              rows={2}
            />
          </Stack>
        </Box>
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => onChange([...value, { key: `stage_${value.length + 1}`, name: 'Новый этап', goal: '', templates: [] }])}
        sx={{ alignSelf: 'flex-start' }}
      >
        Добавить этап
      </Button>
    </Stack>
  )
}

interface FollowupsEditorProps {
  value: FollowupStepDto[]
  onChange: (next: FollowupStepDto[]) => void
}

/** Шаги дожима: через сколько дней молчания, цель, опорная фраза. */
export function FollowupsEditor({ value, onChange }: FollowupsEditorProps) {
  const update = (index: number, patch: Partial<FollowupStepDto>) => {
    onChange(value.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  }
  return (
    <Stack spacing={1.5}>
      {value.map((step, index) => (
        <Stack key={index} direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'flex-start' } }}>
          <TextField
            label="Через дней"
            type="number"
            value={step.afterDays}
            onChange={(event) => update(index, { afterDays: Number(event.target.value) })}
            size="small"
            slotProps={{ htmlInput: { min: 0.001, step: 0.5 } }}
            sx={{ minWidth: 130 }}
            helperText={index === 0 ? 'от начала молчания клиента' : undefined}
          />
          <TextField
            label="Цель касания"
            value={step.goal}
            onChange={(event) => update(index, { goal: event.target.value })}
            size="small"
            fullWidth
          />
          <TextField
            label="Опорная фраза (необязательно)"
            value={step.template ?? ''}
            onChange={(event) => update(index, { template: event.target.value || undefined })}
            size="small"
            fullWidth
          />
          <IconButton aria-label="Удалить шаг" onClick={() => onChange(value.filter((_, i) => i !== index))}>
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => {
          const last = value[value.length - 1]
          onChange([...value, { afterDays: last ? last.afterDays * 2 : 1, goal: '' }])
        }}
        sx={{ alignSelf: 'flex-start' }}
      >
        Добавить шаг
      </Button>
    </Stack>
  )
}
