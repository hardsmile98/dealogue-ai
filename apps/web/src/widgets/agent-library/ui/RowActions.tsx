import IconButton from '@mui/material/IconButton'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { ConfirmAction } from '@/shared/ui'

interface RowActionsProps {
  onEdit: () => void
  /** Вопрос в подтверждении удаления: «Удалить факт?». */
  confirmQuestion: string
  /** Что произойдёт, если это не очевидно из вопроса. */
  confirmDescription?: string
  onDelete: () => void
}

/** Правка и удаление записи — пара кнопок в конце строки любого раздела. */
export function RowActions({ onEdit, confirmQuestion, confirmDescription, onDelete }: RowActionsProps) {
  return (
    <>
      <IconButton size="small" onClick={onEdit} aria-label="Редактировать">
        <EditOutlinedIcon fontSize="small" />
      </IconButton>
      <ConfirmAction
        question={confirmQuestion}
        description={confirmDescription}
        confirmLabel="Удалить"
        destructive
        onConfirm={onDelete}
      >
        {(ask) => (
          <IconButton size="small" onClick={ask} aria-label="Удалить">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
      </ConfirmAction>
    </>
  )
}
