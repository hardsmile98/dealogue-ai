import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import BookmarkBorderOutlinedIcon from '@mui/icons-material/BookmarkBorderOutlined';
import { STAGES } from '@/shared/api';
import type { ExampleBody, ExampleDto } from '@/shared/api';
import { getApiErrorMessage } from '@/shared/lib';
import { EmptyState, QueryBoundary, useNotify } from '@/shared/ui';
import { STAGE_LABELS } from '@/entities/bot';
import {
  useCreateExampleMutation,
  useDeleteExampleMutation,
  useListExamplesQuery,
  useUpdateExampleMutation,
} from '../api/examplesApi';
import { ExampleCard } from './ExampleCard';
import { ExampleDialog } from './ExampleDialog';
import { examplesEditorStyles as styles } from './ExamplesEditor.styles';

const EMPTY: ExampleBody = {
  stage: 'intake',
  situation: '',
  client: '',
  practitioner: '',
  enabled: true,
};

/** Что правим: новый пример или существующий. */
type Editing = { mode: 'create' } | { mode: 'edit'; example: ExampleDto };

/**
 * Примеры реальных диалогов по этапам: агент видит до пяти на своём этапе
 * как образец тона и хода мысли. Пополняются отсюда или кнопкой «В примеры»
 * у сообщения в чате.
 */
export function ExamplesEditor({ accountId }: { accountId: string }) {
  const query = useListExamplesQuery(accountId);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [create, createState] = useCreateExampleMutation();
  const [update, updateState] = useUpdateExampleMutation();
  const [remove] = useDeleteExampleMutation();
  const notify = useNotify();
  const saving = editing?.mode === 'create' ? createState : updateState;

  const save = async (body: ExampleBody) => {
    if (!editing) return;
    try {
      if (editing.mode === 'create') {
        await create({ accountId, body }).unwrap();
        notify.success('Пример добавлен');
      } else {
        await update({
          accountId,
          exampleId: editing.example.id,
          body,
        }).unwrap();
        notify.success('Пример сохранён');
      }
      setEditing(null);
    } catch {
      // Ошибку показывает диалог — по состоянию мутации.
    }
  };

  const toggle = (example: ExampleDto, enabled: boolean) => {
    update({ accountId, exampleId: example.id, body: { enabled } })
      .unwrap()
      .catch((error: unknown) =>
        notify.error(
          getApiErrorMessage(error, 'Не удалось переключить пример'),
        ),
      );
  };

  const closeDialog = () => {
    createState.reset();
    updateState.reset();
    setEditing(null);
  };

  return (
    <Stack spacing={2}>
      <Box sx={styles.toolbar}>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setEditing({ mode: 'create' })}
        >
          Добавить пример
        </Button>
      </Box>

      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить примеры"
        empty={
          <EmptyState
            size="compact"
            icon={<BookmarkBorderOutlinedIcon />}
            title="Примеров пока нет"
            description="Добавьте первый здесь или отметьте удачный ответ в чате кнопкой «В примеры» у сообщения."
          />
        }
      >
        {(examples) => (
          <Stack spacing={3}>
            {STAGES.map((stage) => {
              const items = examples.filter((item) => item.stage === stage);
              if (items.length === 0) return null;
              return (
                <Box key={stage} component="section">
                  <Typography
                    variant="subtitle2"
                    component="h3"
                    sx={styles.stageTitle}
                  >
                    {STAGE_LABELS[stage]} · {items.length}
                  </Typography>
                  <Stack spacing={1}>
                    {items.map((example) => (
                      <ExampleCard
                        key={example.id}
                        example={example}
                        onToggle={(enabled) => toggle(example, enabled)}
                        onEdit={() => setEditing({ mode: 'edit', example })}
                        onDelete={async () => {
                          await remove({
                            accountId,
                            exampleId: example.id,
                          }).unwrap();
                          notify.success('Пример удалён');
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </QueryBoundary>

      {editing && (
        <ExampleDialog
          title={editing.mode === 'create' ? 'Новый пример' : 'Пример'}
          initial={editing.mode === 'create' ? EMPTY : editing.example}
          onClose={closeDialog}
          onSubmit={(body) => void save(body)}
          submitting={saving.isLoading}
          error={saving.error}
        />
      )}
    </Stack>
  );
}
