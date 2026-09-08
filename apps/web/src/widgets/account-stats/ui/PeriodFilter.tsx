import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { daysBetween, pluralize, toDayKey } from '@/shared/lib'
import { PERIOD_PRESETS, matchPreset, presetRange } from '../lib/period'
import type { DateRange, PeriodPresetKey } from '../lib/period'

interface PeriodFilterProps {
  range: DateRange
  onChange: (range: DateRange) => void
}

/** Одна строка фильтров над всей статистикой: пресеты и произвольные даты. */
export function PeriodFilter({ range, onChange }: PeriodFilterProps) {
  const preset = matchPreset(range)
  const today = toDayKey(new Date())

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={1.5}
      useFlexGap
      sx={{ alignItems: { xs: 'stretch', sm: 'center' }, flexWrap: 'wrap' }}
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        value={preset ?? 'custom'}
        onChange={(_event, value: PeriodPresetKey | 'custom' | null) => {
          if (value && value !== 'custom') onChange(presetRange(value))
        }}
        aria-label="Период"
      >
        {PERIOD_PRESETS.map((item) => (
          <ToggleButton key={item.key} value={item.key} sx={{ px: 1.75 }}>
            {item.label}
          </ToggleButton>
        ))}
        <ToggleButton value="custom" disabled sx={{ px: 1.75 }}>
          Период
        </ToggleButton>
      </ToggleButtonGroup>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          type="date"
          size="small"
          label="С"
          value={range.from}
          onChange={(event) => {
            const from = event.target.value
            if (from) onChange({ from, to: from > range.to ? from : range.to })
          }}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: range.to } }}
        />
        <TextField
          type="date"
          size="small"
          label="По"
          value={range.to}
          onChange={(event) => {
            const to = event.target.value
            if (to) onChange({ from: to < range.from ? to : range.from, to })
          }}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: range.from, max: today } }}
        />
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {pluralize(daysBetween(range.from, range.to), ['день', 'дня', 'дней'])}
      </Typography>
    </Stack>
  )
}
