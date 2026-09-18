import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { SectionCard } from '@/shared/ui'
import { FUNNEL_STAGES } from '@/shared/api'
import type { FunnelStage, Gender, SimStartSlots } from '@/shared/api'
import { FUNNEL_STAGE_META } from '@/entities/ai-agent'
import { agentSandboxStyles as styles } from './AgentSandbox.styles'

interface SandboxStartProps {
  onStart: (stage: FunnelStage | null, slots: SimStartSlots) => void
  loading: boolean
  error?: string | null
}

/**
 * Начало сценария. По умолчанию — чистый лист с приветствия, но можно начать
 * с середины воронки и с уже известными данными, чтобы не проходить её заново.
 */
export function SandboxStart({ onStart, loading, error }: SandboxStartProps) {
  const [stage, setStage] = useState<FunnelStage | ''>('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [requestSummary, setRequestSummary] = useState('')
  const [birthDate, setBirthDate] = useState('')

  return (
    <SectionCard
      title="Песочница: диалог с выдуманным клиентом"
      subtitle="Бот отвечает так же, как отвечал бы в настоящем чате: те же плейбуки, образцы и блоки, тот же guard. Ничего никуда не отправляется и не сохраняется."
    >
      <Typography variant="body2" color="text.secondary" sx={styles.startHint}>
        Нажмите «Начать диалог», пишите за клиента и смотрите, что ответит бот. Чтобы проверить поведение в тишине,
        нажмите «Клиент молчит» — часы в песочнице сдвинутся, и бот сделает касания, срок которых наступил.
      </Typography>

      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            select
            size="small"
            fullWidth
            label="Начать с этапа"
            value={stage}
            onChange={(e) => setStage(e.target.value as FunnelStage | '')}
            helperText="По умолчанию — с самого начала"
          >
            <MenuItem value="">приветствие (с нуля)</MenuItem>
            {FUNNEL_STAGES.map((key) => (
              <MenuItem key={key} value={key}>
                {FUNNEL_STAGE_META[key].label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            fullWidth
            label="Пол клиента"
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender | '')}
            helperText="Влияет на подбор текстов"
          >
            <MenuItem value="">неизвестен</MenuItem>
            <MenuItem value="f">женский</MenuItem>
            <MenuItem value="m">мужской</MenuItem>
          </TextField>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            size="small"
            fullWidth
            label="Дата рождения (YYYY-MM-DD)"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            placeholder="1994-03-12"
          />
          <TextField
            size="small"
            fullWidth
            label="Известный запрос"
            value={requestSummary}
            onChange={(e) => setRequestSummary(e.target.value)}
            placeholder="хочет разбор по отношениям"
          />
        </Stack>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          loading={loading}
          onClick={() =>
            onStart(stage || null, {
              gender: gender || null,
              requestSummary: requestSummary.trim() || null,
              birthDate: birthDate.trim() || null,
            })
          }
        >
          Начать диалог
        </Button>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </SectionCard>
  )
}
