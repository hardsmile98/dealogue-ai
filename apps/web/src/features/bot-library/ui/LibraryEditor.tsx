import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { LIBRARY_KINDS, LIBRARY_KIND_LABELS, OBJECTION_LABELS, REQUEST_CATEGORIES } from '@/shared/api'
import type { LibraryItemBody, LibraryItemDto, LibraryKind } from '@/shared/api'
import { useDebouncedValue } from '@/shared/lib'
import { ConfirmAction, QueryBoundary } from '@/shared/ui'
import {
  useCreateLibraryItemMutation,
  useDeleteLibraryItemMutation,
  useListLibraryQuery,
  useUpdateLibraryItemMutation,
} from '../api/libraryApi'
import { LibraryItemDialog } from './LibraryItemDialog'

const styles = {
  item: { border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.25 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 },
  preview: {
    mt: 0.75,
    fontSize: 13,
    color: 'text.secondary',
    whiteSpace: 'pre-wrap',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
} as const

function categoryTitle(item: LibraryItemDto): string | null {
  if (!item.category) return null
  return (
    REQUEST_CATEGORIES.find((category) => category.key === item.category)?.title ??
    OBJECTION_LABELS[item.category as keyof typeof OBJECTION_LABELS] ??
    item.category
  )
}

function toBody(item: LibraryItemDto): LibraryItemBody {
  return {
    kind: item.kind,
    language: item.language === 'en' ? 'en' : 'ru',
    gender: item.gender,
    category: item.category,
    title: item.title,
    text: item.text,
    enabled: item.enabled,
  }
}

/**
 * Библиотека агента по видам: диагностики по категориям и полу, тела вех,
 * образцы фраз, плейбук возражений, раздел «о себе». Выключенный текст
 * агент не использует.
 */
export function LibraryEditor({ accountId }: { accountId: string }) {
  const query = useListLibraryQuery(accountId)
  const [kind, setKind] = useState<LibraryKind | 'all'>('all')
  const [search, setSearch] = useState('')
  const needle = useDebouncedValue(search, 250).trim().toLowerCase()
  const [editing, setEditing] = useState<LibraryItemDto | 'new' | null>(null)
  const [create, createState] = useCreateLibraryItemMutation()
  const [update, updateState] = useUpdateLibraryItemMutation()
  const [remove] = useDeleteLibraryItemMutation()
  const saving = editing === 'new' ? createState : updateState

  const counts = useMemo(() => {
    const result = new Map<LibraryKind, number>()
    for (const item of query.data ?? []) result.set(item.kind, (result.get(item.kind) ?? 0) + 1)
    return result
  }, [query.data])

  const save = (body: LibraryItemBody) => {
    const request =
      editing === 'new' ? create({ accountId, body }) : editing ? update({ accountId, itemId: editing.id, body }) : null
    void request
      ?.unwrap()
      .then(() => setEditing(null))
      .catch(() => undefined)
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          select
          size="small"
          label="Вид"
          value={kind}
          onChange={(event) => setKind(event.target.value as LibraryKind | 'all')}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="all">Все ({query.data?.length ?? 0})</MenuItem>
          {LIBRARY_KINDS.map((option) => (
            <MenuItem key={option} value={option}>
              {LIBRARY_KIND_LABELS[option]} ({counts.get(option) ?? 0})
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Поиск по названию и тексту"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ flexGrow: 1 }}
        />
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing('new')}>
          Добавить
        </Button>
      </Stack>

      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить библиотеку"
        empty="Библиотека пуста — загрузите стандартную на вкладке «Настройки»."
      >
        {(items) => {
          const visible = items.filter(
            (item) =>
              (kind === 'all' || item.kind === kind) &&
              (!needle || item.title.toLowerCase().includes(needle) || item.text.toLowerCase().includes(needle)),
          )
          if (visible.length === 0) {
            return (
              <Typography variant="body2" color="text.secondary">
                Ничего не найдено.
              </Typography>
            )
          }
          return (
            <Stack spacing={1}>
              {visible.map((item) => {
                const category = categoryTitle(item)
                return (
                  <Box key={item.id} sx={[styles.item, { opacity: item.enabled ? 1 : 0.55 }]}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 500, fontSize: 14 }}>{item.title}</Typography>
                        <Box sx={styles.chips}>
                          <Chip size="small" variant="outlined" label={LIBRARY_KIND_LABELS[item.kind]} />
                          <Chip size="small" variant="outlined" label={item.language} />
                          {item.gender && (
                            <Chip size="small" variant="outlined" label={item.gender === 'f' ? 'женщинам' : 'мужчинам'} />
                          )}
                          {category && <Chip size="small" variant="outlined" label={category} />}
                          {item.seedKey && <Chip size="small" label="стандартный" />}
                        </Box>
                      </Box>
                      <Tooltip title={item.enabled ? 'Выключить' : 'Включить'}>
                        <Switch
                          size="small"
                          checked={item.enabled}
                          onChange={(event) =>
                            void update({ accountId, itemId: item.id, body: { enabled: event.target.checked } })
                          }
                        />
                      </Tooltip>
                      <IconButton size="small" aria-label="Изменить" onClick={() => setEditing(item)}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <ConfirmAction
                        question="Удалить текст из библиотеки?"
                        description={
                          item.seedKey ? 'Стандартный текст вернётся при повторной загрузке стандартной библиотеки.' : undefined
                        }
                        confirmLabel="Удалить"
                        destructive
                        onConfirm={() => void remove({ accountId, itemId: item.id })}
                      >
                        {(ask) => (
                          <IconButton size="small" aria-label="Удалить" onClick={ask}>
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        )}
                      </ConfirmAction>
                    </Stack>
                    <Typography sx={styles.preview}>{item.text}</Typography>
                  </Box>
                )
              })}
            </Stack>
          )
        }}
      </QueryBoundary>

      {editing && (
        <LibraryItemDialog
          title={editing === 'new' ? 'Новый текст' : 'Текст библиотеки'}
          initial={
            editing === 'new'
              ? {
                  kind: kind === 'all' ? 'empathy' : kind,
                  language: 'ru',
                  gender: null,
                  category: null,
                  title: '',
                  text: '',
                  enabled: true,
                }
              : toBody(editing)
          }
          onClose={() => setEditing(null)}
          onSubmit={save}
          submitting={saving.isLoading}
          error={saving.error}
        />
      )}
    </Stack>
  )
}
