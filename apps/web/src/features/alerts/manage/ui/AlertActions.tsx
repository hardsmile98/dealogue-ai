import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import CheckIcon from '@mui/icons-material/Check'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import type { AlertDto } from '@/shared/api'
import { useAckAlertMutation, useResolveAlertMutation } from '@/entities/alert'

interface AlertActionsProps {
  alert: AlertDto
}

/** «Просмотрено» и «Закрыть» для одного алерта. */
export function AlertActions({ alert }: AlertActionsProps) {
  const [ack, { isLoading: acking }] = useAckAlertMutation()
  const [resolve, { isLoading: resolving }] = useResolveAlertMutation()

  if (alert.status === 'resolved') return null

  return (
    <Stack direction="row" spacing={1}>
      {alert.status === 'open' && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<VisibilityOutlinedIcon />}
          loading={acking}
          onClick={() => void ack(alert.id)}
        >
          Просмотрено
        </Button>
      )}
      <Button
        size="small"
        variant="contained"
        startIcon={<CheckIcon />}
        loading={resolving}
        onClick={() => void resolve(alert.id)}
      >
        Закрыть
      </Button>
    </Stack>
  )
}
