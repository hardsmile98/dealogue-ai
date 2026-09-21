import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import type { SimTurnInfo } from '@/shared/api'
import { agentSandboxStyles as styles } from './AgentSandbox.styles'

interface SandboxTurnDetailsProps {
  turn: SimTurnInfo
}

/** Что именно заполнила модель — только те поля карточки, о которых она что-то узнала. */
function filledCard(card: Record<string, unknown>): string[] {
  return Object.entries(card)
    .filter(([key]) => key !== 'evidence' && key !== 'cleared')
    .filter(([, value]) => value !== null && value !== false && value !== undefined)
    .filter(([, value]) => !Array.isArray(value) || value.length > 0)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.map(String).join('; ') : String(value)}`)
}

/**
 * Разбор хода под сообщением бота: задача, что модель поняла, что заметил
 * guard, какие образцы и блоки участвовали и во что обошёлся вызов.
 */
export function SandboxTurnDetails({ turn }: SandboxTurnDetailsProps) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState(false)

  const analysis = turn.analysis ?? {}
  const card = (analysis.card as Record<string, unknown> | undefined) ?? {}
  const filled = filledCard(card)
  const violations = turn.guardNotes.flatMap((note) => (note.violations as { detail: string }[] | undefined) ?? [])
  const fixes = turn.guardNotes.flatMap((note) => (note.fixes as string[] | undefined) ?? [])
  const guard = [...fixes, ...violations.map((hit) => hit.detail)].join('; ')
  const tokens = turn.usage.tokensIn + turn.usage.tokensOut

  return (
    <Box>
      <Button size="small" sx={styles.detailsToggle} onClick={() => setOpen((v) => !v)}>
        {open ? 'скрыть разбор хода' : 'разбор хода'}
      </Button>
      <Collapse in={open} unmountOnExit>
        <Box sx={styles.details}>
          {turn.task && (
            <Box>
              <strong>Задача хода:</strong> {turn.task}
            </Box>
          )}
          {typeof analysis.clientIntent === 'string' && (
            <Box sx={styles.detailsLine}>
              <strong>Понял так:</strong> {analysis.clientIntent}
            </Box>
          )}
          {typeof analysis.replyPlan === 'string' && analysis.replyPlan && (
            <Box sx={styles.detailsLine}>
              <strong>План ответа:</strong> {analysis.replyPlan}
            </Box>
          )}
          <Box sx={styles.detailsLine}>
            Уверенность {typeof analysis.confidence === 'number' ? analysis.confidence.toFixed(2) : '—'} · продвижение{' '}
            {String(analysis.stageProgress ?? 'stay')} · этап {turn.stageBefore} → {turn.stageAfter}
          </Box>
          {filled.length > 0 && <Box sx={styles.detailsLine}>Карточка: {filled.join(', ')}</Box>}
          {guard && (
            <Box sx={styles.detailsLine}>
              <strong>Guard:</strong> {guard}
              {!turn.guardOk && ' (ответ не прошёл проверку дважды)'}
            </Box>
          )}
          <Box sx={styles.detailsMuted}>
            Образцы: {turn.examples.map((example) => `${example.kind} «${example.title}»`).join(', ') || '—'}. Блоки:{' '}
            {turn.blocks.map((block) => block.title).join(', ') || '—'}.
          </Box>
          {turn.similarCases.length > 0 && (
            <Box sx={styles.detailsMuted}>
              Похожие случаи ({turn.similarCases.length}):{' '}
              {turn.similarCases
                .map(
                  (item) =>
                    `«${item.clientText.slice(0, 60)}» → ${item.outcome === 'bad' ? 'так не надо: ' : ''}«${item.answerText.slice(0, 60)}»`,
                )
                .join('; ')}
            </Box>
          )}
          <Box sx={styles.detailsMuted}>
            {turn.usage.model} · {tokens} ток. · {(turn.usage.durationMs / 1000).toFixed(1)} с
          </Box>
          {turn.prompts && (
            <Box>
              <Button size="small" sx={styles.detailsToggle} onClick={() => setPrompt((v) => !v)}>
                {prompt ? 'скрыть промпт' : 'показать промпт'}
              </Button>
              <Collapse in={prompt} unmountOnExit>
                <Box component="pre" sx={styles.prompt}>
                  {`=== SYSTEM ===\n${turn.prompts.system}\n\n=== USER ===\n${turn.prompts.user}`}
                </Box>
              </Collapse>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}
