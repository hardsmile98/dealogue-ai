import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { formatRelative } from '@/shared/lib'
import type { SimilarCaseDto } from '@/shared/api'
import { draftCardStyles as styles } from './DraftCard.styles'

interface SimilarCasesProps {
  cases: SimilarCaseDto[]
}

/** Однострочная выжимка: переписка бывает многострочной, а тут нужен только смысл. */
function cut(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/** Похожие прошлые случаи из промпта: что писал клиент и чем тогда ответили. */
export function SimilarCases({ cases }: SimilarCasesProps) {
  const [open, setOpen] = useState(false)

  return (
    <Box sx={styles.block}>
      <Button size="small" variant="text" sx={styles.toggle} onClick={() => setOpen(!open)}>
        {open ? 'Скрыть похожие случаи' : `Похожие случаи из переписок (${cases.length})`}
      </Button>
      <Collapse in={open}>
        <Stack spacing={1} sx={styles.casesList}>
          {cases.map((item) => (
            <Box key={item.id} sx={styles.case}>
              <Typography variant="caption" color="text.secondary" sx={styles.caseMeta}>
                {item.source === 'draft' ? 'ответил менеджер' : 'удачный ход бота'} ·{' '}
                {formatRelative(item.createdAt)}
              </Typography>
              <Typography variant="body2">Клиент: {cut(item.clientText, 200)}</Typography>
              <Typography variant="body2" color="text.secondary">
                Ответ: {cut(item.answerText, 300)}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  )
}
