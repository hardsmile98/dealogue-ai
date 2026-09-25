import { useParams, useSearchParams } from 'react-router-dom'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { QueryBoundary, SectionCard } from '@/shared/ui'
import { useGetBotSettingsQuery } from '@/entities/bot'
import { ExamplesEditor } from '@/features/bot-examples'
import { LibraryEditor } from '@/features/bot-library'
import { AgentToggle, LibraryImportCard, PersonaForm, TimingsForm } from '@/features/bot-settings'

type Section = 'settings' | 'library' | 'examples'

function readSection(value: string | null): Section {
  return value === 'library' || value === 'examples' ? value : 'settings'
}

/** Вкладка «Агент»: настройки, библиотека текстов, примеры диалогов. Раздел — в `?section=`, чтобы ссылка открывала нужный. */
export function AccountBotPage() {
  const { accountId = '' } = useParams<{ accountId: string }>()
  const [params, setParams] = useSearchParams()
  const section = readSection(params.get('section'))
  const query = useGetBotSettingsQuery(accountId, { skip: accountId === '' })

  return (
    <Stack spacing={2}>
      <Tabs
        value={section}
        onChange={(_event, value: Section) => setParams(value === 'settings' ? {} : { section: value }, { replace: true })}
      >
        <Tab value="settings" label="Настройки" />
        <Tab value="library" label="Библиотека" />
        <Tab value="examples" label="Примеры" />
      </Tabs>

      {section === 'library' && (
        <SectionCard
          title="Библиотека"
          subtitle="Тексты, из которых агент берёт вехи (ссылки, диагностики, описание услуг, цены), образцы фраз и подходы к возражениям."
        >
          <LibraryEditor accountId={accountId} />
        </SectionCard>
      )}

      {section === 'examples' && (
        <SectionCard
          title="Примеры диалогов"
          subtitle="Удачные ответы из реальных чатов: агент видит их на своём этапе как образец. Отметить ответ можно и прямо в чате."
        >
          <ExamplesEditor accountId={accountId} />
        </SectionCard>
      )}

      {section === 'settings' && (
        <QueryBoundary query={query} errorText="Не удалось загрузить настройки агента" skeleton={320} isEmpty={() => false}>
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

              <SectionCard title="Образ практика" subtitle="От чьего лица агент пишет: имя, биография и ссылки на страницы.">
                <PersonaForm accountId={settings.accountId} initial={settings.persona} />
              </SectionCard>

              <SectionCard
                title="Тайминги"
                subtitle="Диапазон — случайное значение внутри него, чтобы касания не выглядели рассылкой."
              >
                <TimingsForm accountId={settings.accountId} initial={settings.timings} />
              </SectionCard>
            </Stack>
          )}
        </QueryBoundary>
      )}
    </Stack>
  )
}
