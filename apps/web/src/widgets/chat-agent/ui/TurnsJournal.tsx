import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { TurnDto } from '@/shared/api'
import { TurnCard } from './TurnCard'
import { chatAgentStyles as styles } from './ChatAgent.styles'

interface TurnsJournalProps {
  accountId: string
  chatId: string
  turns: TurnDto[]
}

/** Свёрнутый журнал ходов: анализ, что планировалось, что ушло, guard. */
export function TurnsJournal({ accountId, chatId, turns }: TurnsJournalProps) {
  if (turns.length === 0) return null

  return (
    <Accordion disableGutters sx={styles.journal}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" sx={styles.journalTitle}>
          Журнал ходов бота · {turns.length}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={styles.journalBody}>
        <Stack spacing={1}>
          {turns.map((turn) => (
            <TurnCard key={turn.id} accountId={accountId} chatId={chatId} turn={turn} />
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}
