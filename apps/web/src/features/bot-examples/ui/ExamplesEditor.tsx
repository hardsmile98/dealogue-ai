import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { STAGES, STAGE_LABELS } from '@/shared/api'
import type { ExampleBody, ExampleDto } from '@/shared/api'
import { ConfirmAction, QueryBoundary } from '@/shared/ui'
import {
  useCreateExampleMutation,
  useDeleteExampleMutation,
  useListExamplesQuery,
  useUpdateExampleMutation,
} from '../api/examplesApi'
import { ExampleDialog } from './ExampleDialog'

const EMPTY: ExampleBody = { stage: 'intake', situation: '', client: '', practitioner: '', enabled: true }

const styles = {
  item: { border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 },
  text: { fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  label: { fontSize: 12, color: 'text.secondary', mt: 0.75 },
} as const

/**
 * Примеры реальных диалогов по этапам: агент видит до пяти на своём этапе
 * как образец тона и хода мысли. Пополняются отсюда или кнопкой «В примеры»
 * у сообщения в чате.
 */
export function ExamplesEditor({ accountId }: { accountId: string }) {
  const query = useListExamplesQuery(accountId)
  const [editing, setEditing] = useState<ExampleDto | 'new' | null>(null)
  const [create, createState] = useCreateExampleMutation()
  const [update, updateState] = useUpdateExampleMutation()
  const [remove] = useDeleteExampleMutation()
  const saving = editing === 'new' ? createState : updateState

  const save = (body: ExampleBody) => {
    const request =
      editing === 'new' ? create({ accountId, body }) : editing ? update({ accountId, exampleId: editing.id, body }) : null
    void request
      ?.unwrap()
      .then(() => setEditing(null))
      .catch(() => undefined)
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing('new')}>
          Добавить пример
        </Button>
      </Box>
      <QueryBoundary query={query} errorText="Не удалось загрузить примеры" empty="Примеров пока нет — добавьте первый или отметьте удачный ответ в чате.">
        {(examples) => (
          <Stack spacing={2.5}>
            {STAGES.map((stage) => {
              const items = examples.filter((example) => example.stage === stage)
              if (items.length === 0) return null
              return (
                <Box key={stage}>
                  <Typography sx={{ fontWeight: 600, mb: 1 }}>
                    {STAGE_LABELS[stage]} · {items.length}
                  </Typography>
                  <Stack spacing={1}>
                    {items.map((example) => (
                      <Box key={example.id} sx={[styles.item, { opacity: example.enabled ? 1 : 0.55 }]}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Typography sx={{ fontWeight: 500, flexGrow: 1, fontSize: 14 }}>{example.situation}</Typography>
                          {!example.enabled && <Chip size="small" label="выключен" />}
                          <Tooltip title={example.enabled ? 'Выключить' : 'Включить'}>
                            <Switch
                              size="small"
                              checked={example.enabled}
                              onChange={(event) => void update({ accountId, exampleId: example.id, body: { enabled: event.target.checked } })}
                            />
                          </Tooltip>
                          <IconButton size="small" aria-label="Изменить" onClick={() => setEditing(example)}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                          <ConfirmAction question="Удалить пример?" confirmLabel="Удалить" destructive onConfirm={() => void remove({ accountId, exampleId: example.id })}>
                            {(ask) => (
                              <IconButton size="small" aria-label="Удалить" onClick={ask}>
                                <DeleteOutlinedIcon fontSize="small" />
                              </IconButton>
                            )}
                          </ConfirmAction>
                        </Stack>
                        <Typography sx={styles.label}>Клиент</Typography>
                        <Typography sx={styles.text}>{example.client}</Typography>
                        <Typography sx={styles.label}>Практик</Typography>
                        <Typography sx={styles.text}>{example.practitioner}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )
            })}
          </Stack>
        )}
      </QueryBoundary>
      {editing && (
        <ExampleDialog
          open
          title={editing === 'new' ? 'Новый пример' : 'Пример'}
          initial={editing === 'new' ? EMPTY : editing}
          onClose={() => setEditing(null)}
          onSubmit={save}
          submitting={saving.isLoading}
          error={saving.error}
        />
      )}
    </Stack>
  )
}
