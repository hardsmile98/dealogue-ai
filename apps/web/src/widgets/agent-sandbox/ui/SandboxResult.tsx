import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { SectionCard } from '@/shared/ui'
import type { SandboxResponse } from '@/shared/api'
import { FUNNEL_STAGE_META } from '@/entities/ai-agent'
import { HANDOFF_REASON_LABELS } from '@/entities/alert'
import { agentSandboxStyles as styles } from './AgentSandbox.styles'

interface SandboxResultProps {
  data: SandboxResponse
  showPrompts: boolean
  onTogglePrompts: () => void
}

/** Что именно заполнила модель — только те слоты, о которых она что-то узнала. */
function filledSlots(slots: Record<string, unknown>): string[] {
  return Object.entries(slots)
    .filter(([, value]) => value !== null && value !== false && value !== undefined)
    .filter(([, value]) => !Array.isArray(value) || value.length > 0)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.map(String).join('; ') : String(value)}`)
}

/** Разбор одного прогона: вердикт, что отправил бы, что понял, промпт. */
export function SandboxResult({ data, showPrompts, onTogglePrompts }: SandboxResultProps) {
  const analysis = data.analysis ?? {}
  const card = (analysis.card as Record<string, unknown> | undefined) ?? {}
  const slots = filledSlots(card)
  const guardHits = data.guardNotes.flatMap((note) => (note.violations as { detail: string }[] | undefined) ?? [])
  const fixes = data.guardNotes.flatMap((note) => (note.fixes as string[] | undefined) ?? [])
  const guardSummary = [...fixes, ...guardHits.map((hit) => hit.detail)].join('; ')

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={styles.verdictRow}>
        <Chip
          size="small"
          variant="outlined"
          label={`${FUNNEL_STAGE_META[data.stage].short} → ${FUNNEL_STAGE_META[data.stageAfter].short}`}
        />
        {data.verdict.kind === 'proceed' && (
          <Chip
            size="small"
            color={data.send ? 'success' : 'default'}
            label={data.send ? 'ответил бы' : 'промолчал бы'}
          />
        )}
        {data.verdict.kind === 'handoff' && (
          <Chip
            size="small"
            color="warning"
            label={`менеджеру: ${HANDOFF_REASON_LABELS[data.verdict.reason ?? ''] ?? data.verdict.reason}`}
          />
        )}
        {data.verdict.kind === 'skip' && <Chip size="small" label={`пропуск: ${data.verdict.detail}`} />}
        {!data.guardOk && <Chip size="small" color="error" label="guard отклонил дважды" />}
        <Box sx={styles.spacer} />
        <Typography variant="caption" color="text.secondary">
          {data.usage.model} · {data.usage.tokensIn + data.usage.tokensOut} ток. ·{' '}
          {(data.usage.durationMs / 1000).toFixed(1)} с
        </Typography>
      </Stack>

      {data.task && (
        <Typography variant="body2" color="text.secondary">
          <strong>Задача хода:</strong> {data.task}
        </Typography>
      )}
      {data.verdict.detail && data.verdict.kind !== 'proceed' && (
        <Alert severity="warning">{data.verdict.detail}</Alert>
      )}

      {data.messages.length > 0 && (
        <Stack spacing={0.75}>
          {data.messages.map((message, index) => (
            <Box key={index} sx={styles.bubble}>
              {message.blockKind && (
                <Chip size="small" variant="outlined" label={`блок ${message.blockKind}`} sx={styles.bubbleBadge} />
              )}
              <Box>{message.text}</Box>
            </Box>
          ))}
        </Stack>
      )}
      {data.silentReason && <Alert severity="info">Промолчал бы: {data.silentReason}</Alert>}

      <SectionCard title="Что понял">
        <Box sx={styles.analysis}>
          {typeof analysis.clientIntent === 'string' && <div>Намерение: {analysis.clientIntent}</div>}
          <div>
            Язык: {String(card.language ?? '—')} · уверенность{' '}
            {typeof analysis.confidence === 'number' ? analysis.confidence.toFixed(2) : '—'} · продвижение:{' '}
            {String(analysis.stageProgress ?? 'stay')}
          </div>
          {slots.length > 0 && <div>Карточка: {slots.join(', ')}</div>}
          {guardSummary && (
            <Box sx={styles.analysisLine}>
              <strong>Guard:</strong> {guardSummary}
            </Box>
          )}
          <Box sx={styles.analysisMuted}>
            Образцы: {data.examples.map((example) => `${example.kind} «${example.title}»`).join(', ') || '—'}. Блоки:{' '}
            {data.blocks.map((block) => block.title).join(', ') || '—'}.
          </Box>
          {data.similarCases.length > 0 && (
            <Box sx={styles.analysisMuted}>
              Похожие случаи ({data.similarCases.length}):{' '}
              {data.similarCases
                .map((item) => `«${item.clientText.slice(0, 60)}» → «${item.answerText.slice(0, 60)}»`)
                .join('; ')}
            </Box>
          )}
        </Box>
      </SectionCard>

      {data.prompts && (
        <Box>
          <Button size="small" onClick={onTogglePrompts}>
            {showPrompts ? 'Скрыть промпт' : 'Показать промпт'}
          </Button>
          {showPrompts && (
            <Box component="pre" sx={styles.prompt}>
              {`=== SYSTEM ===\n${data.prompts.system}\n\n=== USER ===\n${data.prompts.user}`}
            </Box>
          )}
        </Box>
      )}
    </Stack>
  )
}
