import { useState } from 'react'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined'
import type { Stage } from '@/shared/api'
import { useCreateExampleMutation } from '../api/examplesApi'
import { ExampleDialog } from './ExampleDialog'

interface AddExampleButtonProps {
  accountId: string
  /** Сообщения клиента перед ответом — одним текстом. */
  client: string
  /** Ответ практика — это сообщение. */
  practitioner: string
  stage: Stage
}

/** «В примеры»: удачный ответ из реального чата становится образцом для агента. */
export function AddExampleButton({ accountId, client, practitioner, stage }: AddExampleButtonProps) {
  const [open, setOpen] = useState(false)
  const [create, { isLoading, error, reset }] = useCreateExampleMutation()

  return (
    <>
      <Tooltip title="В примеры для агента">
        <IconButton size="small" aria-label="В примеры" sx={{ p: 0.25 }} onClick={() => setOpen(true)}>
          <BookmarkAddOutlinedIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      {open && (
        <ExampleDialog
          open
          title="Пример для агента"
          initial={{ stage, situation: '', client, practitioner, enabled: true }}
          onClose={() => {
            reset()
            setOpen(false)
          }}
          onSubmit={(body) => {
            void create({ accountId, body })
              .unwrap()
              .then(() => setOpen(false))
              .catch(() => undefined)
          }}
          submitting={isLoading}
          error={error}
        />
      )}
    </>
  )
}
