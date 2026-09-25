import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { QueryBoundary, SectionCard } from '@/shared/ui';
import { useGetBotSettingsQuery } from '@/entities/bot';
import {
  AgentToggle,
  LibraryImportCard,
  PersonaForm,
  TimingsForm,
} from '@/features/bot-settings';

/** Настройки агента: включение, стандартная библиотека, образ, тайминги. */
export function BotSettingsSection({ accountId }: { accountId: string }) {
  const query = useGetBotSettingsQuery(accountId, { skip: accountId === '' });

  return (
    <QueryBoundary
      query={query}
      errorText="Не удалось загрузить настройки агента"
      skeleton={<SettingsSkeleton />}
    >
      {(settings) => (
        <Stack spacing={3}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 5 }}>
              <SectionCard
                title="Агент"
                subtitle="Ведёт переписку от лица практика до сообщения с ценами, дальше отвечает менеджер."
                fullHeight
              >
                <AgentToggle settings={settings} />
              </SectionCard>
            </Grid>
            <Grid size={{ xs: 12, md: 7 }}>
              <SectionCard
                title="Стандартная библиотека"
                subtitle="Тексты из таблиц владельца: диагностики, описание услуг, цены, образцы фраз."
                fullHeight
              >
                <LibraryImportCard settings={settings} />
              </SectionCard>
            </Grid>
          </Grid>

          <SectionCard
            title="Образ практика"
            subtitle="От чьего лица агент пишет: имя, биография и ссылки на страницы."
          >
            <PersonaForm
              accountId={settings.accountId}
              initial={settings.persona}
            />
          </SectionCard>

          <SectionCard
            title="Тайминги"
            subtitle="Диапазон — случайное значение внутри него, чтобы касания не выглядели рассылкой."
          >
            <TimingsForm
              accountId={settings.accountId}
              initial={settings.timings}
            />
          </SectionCard>
        </Stack>
      )}
    </QueryBoundary>
  );
}

function SettingsSkeleton() {
  return (
    <Stack spacing={3} aria-busy aria-label="Загружаем настройки агента">
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Skeleton variant="rounded" height={220} />
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Skeleton variant="rounded" height={220} />
        </Grid>
      </Grid>
      <Skeleton variant="rounded" height={360} />
    </Stack>
  );
}
