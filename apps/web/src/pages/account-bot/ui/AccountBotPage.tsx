import { useParams, useSearchParams } from 'react-router-dom';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { SectionCard } from '@/shared/ui';
import { LibraryEditor } from '@/features/bot-library';
import { BotSettingsSection } from './BotSettingsSection';

type Section = 'settings' | 'library';

const SECTIONS: { value: Section; label: string }[] = [
  { value: 'settings', label: 'Настройки' },
  { value: 'library', label: 'Библиотека' },
];

function readSection(value: string | null): Section {
  return value === 'library' ? value : 'settings';
}

/**
 * Вкладка «Агент»: настройки и библиотека текстов. Раздел — в `?section=`,
 * чтобы ссылка открывала нужный.
 */
export function AccountBotPage() {
  const { accountId = '' } = useParams<{ accountId: string }>();
  const [params, setParams] = useSearchParams();
  const section = readSection(params.get('section'));

  return (
    <Stack spacing={2}>
      <Tabs
        value={section}
        onChange={(_event, value: Section) =>
          setParams(value === 'settings' ? {} : { section: value }, {
            replace: true,
          })
        }
        aria-label="Разделы агента"
      >
        {SECTIONS.map((item) => (
          <Tab key={item.value} value={item.value} label={item.label} />
        ))}
      </Tabs>

      {section === 'settings' && <BotSettingsSection accountId={accountId} />}

      {section === 'library' && (
        <SectionCard
          title="Библиотека"
          subtitle="Тексты, из которых агент берёт вехи (ссылки, диагностики, описание услуг, цены), фразы шагов воронки, по которым агент пишет свои сообщения, и подходы к возражениям."
        >
          <LibraryEditor accountId={accountId} />
        </SectionCard>
      )}
    </Stack>
  );
}
