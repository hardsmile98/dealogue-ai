import { useCallback, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import type { LibraryItemBody, LibraryItemDto } from '@/shared/api';
import { getApiErrorMessage, pluralize, useDebouncedValue } from '@/shared/lib';
import { EmptyState, QueryBoundary, useNotify } from '@/shared/ui';
import {
  useCreateLibraryItemMutation,
  useDeleteLibraryItemMutation,
  useListLibraryQuery,
  useUpdateLibraryItemMutation,
} from '../api/libraryApi';
import {
  countByKind,
  filterLibrary,
  newItemBody,
  toBody,
} from '../lib/library';
import type { KindFilter } from '../lib/library';
import { libraryEditorStyles as styles } from './LibraryEditor.styles';
import { LibraryItemCard } from './LibraryItemCard';
import { LibraryItemDialog } from './LibraryItemDialog';
import { LibraryToolbar } from './LibraryToolbar';

const SEARCH_DEBOUNCE_MS = 250;

/** Что правим: новый текст или существующий. */
type Editing = { mode: 'create' } | { mode: 'edit'; item: LibraryItemDto };

/**
 * Библиотека агента по видам: диагностики по категориям и полу, тела вех,
 * образцы фраз, плейбук возражений, раздел «о себе». Выключенный текст
 * агент не использует.
 */
export function LibraryEditor({ accountId }: { accountId: string }) {
  const query = useListLibraryQuery(accountId);
  const [kind, setKind] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [create, createState] = useCreateLibraryItemMutation();
  const [update, updateState] = useUpdateLibraryItemMutation();
  const [remove] = useDeleteLibraryItemMutation();
  const notify = useNotify();
  const saving = editing?.mode === 'create' ? createState : updateState;

  const items = query.data;
  const counts = useMemo(() => countByKind(items ?? []), [items]);
  const visible = useMemo(
    () => filterLibrary(items ?? [], kind, debouncedSearch),
    [items, kind, debouncedSearch],
  );

  const toggle = useCallback(
    (item: LibraryItemDto, enabled: boolean) => {
      update({ accountId, itemId: item.id, body: { enabled } })
        .unwrap()
        .catch((error: unknown) =>
          notify.error(
            getApiErrorMessage(error, 'Не удалось переключить текст'),
          ),
        );
    },
    [accountId, update, notify],
  );

  const edit = useCallback(
    (item: LibraryItemDto) => setEditing({ mode: 'edit', item }),
    [],
  );

  const deleteItem = useCallback(
    async (item: LibraryItemDto) => {
      await remove({ accountId, itemId: item.id }).unwrap();
      notify.success(`«${item.title}» удалён из библиотеки`);
    },
    [accountId, remove, notify],
  );

  const save = async (body: LibraryItemBody) => {
    if (!editing) return;
    try {
      if (editing.mode === 'create') {
        await create({ accountId, body }).unwrap();
        notify.success('Текст добавлен в библиотеку');
      } else {
        await update({ accountId, itemId: editing.item.id, body }).unwrap();
        notify.success('Текст сохранён');
      }
      setEditing(null);
    } catch {
      // Ошибку показывает диалог — по состоянию мутации.
    }
  };

  const closeDialog = () => {
    createState.reset();
    updateState.reset();
    setEditing(null);
  };

  const resetFilters = () => {
    setKind('all');
    setSearch('');
  };

  return (
    <Stack spacing={2}>
      <LibraryToolbar
        kind={kind}
        onKindChange={setKind}
        search={search}
        onSearchChange={setSearch}
        total={items?.length ?? 0}
        counts={counts}
        onAdd={() => setEditing({ mode: 'create' })}
      />

      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить библиотеку"
        empty={
          <EmptyState
            size="compact"
            icon={<LibraryBooksOutlinedIcon />}
            title="Библиотека пуста"
            description="Загрузите стандартную библиотеку на вкладке «Настройки» или добавьте первый текст сами."
          />
        }
      >
        {() =>
          visible.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<SearchOffOutlinedIcon />}
              title="Ничего не найдено"
              description="Под выбранный вид и поиск не подходит ни один текст."
              action={<Button onClick={resetFilters}>Сбросить фильтры</Button>}
            />
          ) : (
            <Stack spacing={1}>
              {visible.length !== items?.length && (
                <Typography variant="body2" sx={styles.summary}>
                  Показано{' '}
                  {pluralize(visible.length, ['текст', 'текста', 'текстов'])} из{' '}
                  {items?.length ?? 0}
                </Typography>
              )}
              {visible.map((item) => (
                <LibraryItemCard
                  key={item.id}
                  item={item}
                  onToggle={toggle}
                  onEdit={edit}
                  onDelete={deleteItem}
                />
              ))}
            </Stack>
          )
        }
      </QueryBoundary>

      {editing && (
        <LibraryItemDialog
          title={editing.mode === 'create' ? 'Новый текст' : 'Текст библиотеки'}
          initial={
            editing.mode === 'create' ? newItemBody(kind) : toBody(editing.item)
          }
          onClose={closeDialog}
          onSubmit={(body) => void save(body)}
          submitting={saving.isLoading}
          error={saving.error}
        />
      )}
    </Stack>
  );
}
