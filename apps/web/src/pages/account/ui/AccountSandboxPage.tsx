import { useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { accountLinks } from '@/shared/config'
import { EmptyState } from '@/shared/ui'
import type { SxStyles } from '@/shared/types'
import { SandboxSession, SandboxSessionList } from '@/features/bot-sandbox'

const pageStyles = {
  root: {
    display: 'grid',
    gridTemplateColumns: '260px minmax(0, 1fr)',
    gridTemplateRows: 'minmax(0, 1fr)',
    // Высота по экрану, как у «Чатов»: лента и журнал прокручиваются внутри,
    // страница не растягивается на всю переписку.
    height: { xs: 'calc(100dvh - 240px)', md: 'calc(100dvh - 268px)' },
    minHeight: { xs: 440, md: 560 },
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 3,
    overflow: 'hidden',
    bgcolor: 'background.paper',
  },
  singleColumn: {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  empty: {
    display: 'grid',
    placeItems: 'center',
    bgcolor: '#f7f7fb',
    p: 3,
  },
} satisfies SxStyles

/**
 * Вкладка «Песочница»: агент ведёт диалог без Telegram, за клиента пишет
 * владелец, время виртуальное. Слева сессии, в центре переписка, справа
 * журнал ходов и память. На узком экране — одна колонка: список или диалог.
 */
export function AccountSandboxPage() {
  const { accountId = '', sessionId } = useParams<{ accountId: string; sessionId?: string }>()
  const navigate = useNavigate()
  const theme = useTheme()
  const isNarrow = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true })
  const showList = !isNarrow || !sessionId
  const showSession = !isNarrow || Boolean(sessionId)

  return (
    <Box sx={[pageStyles.root, isNarrow && pageStyles.singleColumn]}>
      {showList && <SandboxSessionList accountId={accountId} selectedId={sessionId ?? null} />}
      {showSession &&
        (sessionId ? (
          <SandboxSession
            key={sessionId}
            accountId={accountId}
            sessionId={sessionId}
            onBack={isNarrow ? () => navigate(accountLinks.sandbox(accountId)) : undefined}
          />
        ) : (
          <Box sx={pageStyles.empty}>
            <EmptyState
              size="compact"
              title="Выберите диалог или начните новый"
              description="Песочница прогоняет агента на тех же промптах, библиотеке и правилах, что в Telegram, но ничего не отправляет. Здесь видно, что агент понял, что решил и почему так ответил."
            />
          </Box>
        ))}
    </Box>
  )
}
