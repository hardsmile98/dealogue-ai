import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { accountLinks } from '@/shared/config';
import { EmptyState } from '@/shared/ui';
import { SandboxSession, SandboxSessionList } from '@/features/bot-sandbox';
import { accountSandboxStyles as styles } from './AccountSandboxPage.styles';

/**
 * Вкладка «Песочница»: агент ведёт диалог без Telegram, за клиента пишет
 * владелец, время виртуальное. Слева сессии, в центре переписка, справа
 * журнал ходов и память. На узком экране — одна колонка: список или диалог.
 */
export function AccountSandboxPage() {
  const { accountId = '', sessionId } = useParams<{
    accountId: string;
    sessionId?: string;
  }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const showList = !isNarrow || !sessionId;
  const showSession = !isNarrow || Boolean(sessionId);

  return (
    <Box sx={[styles.root, isNarrow && styles.singleColumn]}>
      {showList && (
        <SandboxSessionList
          accountId={accountId}
          selectedId={sessionId ?? null}
        />
      )}
      {showSession &&
        (sessionId ? (
          <SandboxSession
            key={sessionId}
            accountId={accountId}
            sessionId={sessionId}
            onBack={
              isNarrow
                ? () => navigate(accountLinks.sandbox(accountId))
                : undefined
            }
          />
        ) : (
          <Box sx={styles.empty}>
            <EmptyState
              size="compact"
              icon={<ScienceOutlinedIcon />}
              title="Выберите диалог или начните новый"
              description="Песочница прогоняет агента на тех же промптах, библиотеке и правилах, что в Telegram, но ничего не отправляет. Здесь видно, что агент понял, что решил и почему так ответил."
            />
          </Box>
        ))}
    </Box>
  );
}
