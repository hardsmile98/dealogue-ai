import { useState } from 'react'
import type { ReactNode } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

interface ConfirmActionProps {
  /** Вопрос в заголовке: «Удалить факт?». */
  question: string
  /** Чем это обернётся — если последствие не очевидно из вопроса. */
  description?: ReactNode
  /** Надпись на подтверждающей кнопке. */
  confirmLabel?: string
  /** Красная кнопка — для удаления и прочего необратимого. */
  destructive?: boolean
  onConfirm: () => void
  /** Триггер: получает функцию, открывающую диалог. */
  children: (ask: () => void) => ReactNode
}

/**
 * Подтверждение необратимого действия.
 *
 * Заменяет `window.confirm`: тот блокирует вкладку, выглядит системным
 * окном браузера и не даёт ни пояснения, ни осмысленных надписей на кнопках.
 * Триггер передаётся функцией, поэтому одинаково работает и с кнопкой,
 * и с иконкой в строке таблицы.
 */
export function ConfirmAction({
  question,
  description,
  confirmLabel = 'Подтвердить',
  destructive = false,
  onConfirm,
  children,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false)

  const confirm = () => {
    setOpen(false)
    onConfirm()
  }

  return (
    <>
      {children(() => setOpen(true))}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{question}</DialogTitle>
        {description && (
          <DialogContent>
            <DialogContentText component="div">{description}</DialogContentText>
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant="contained" color={destructive ? 'error' : 'primary'} onClick={confirm}>
            {confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
