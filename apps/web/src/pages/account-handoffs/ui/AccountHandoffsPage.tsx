import { useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import { EmptyState, QueryBoundary, SectionCard } from '@/shared/ui';
import { groupHandoffs, useGetHandoffsQuery } from '@/entities/bot';
import { accountHandoffsStyles as styles } from './AccountHandoffsPage.styles';
import { HandoffListItem } from './HandoffListItem';

/** Живые события обновляют список сами; опрос — страховка и счётчик «ждёт N минут». */
const POLLING_INTERVAL_MS = 60_000;

/**
 * Вкладка «У менеджера»: чаты, которые агент передал. Сверху — ждущие
 * ответа, дольше всех ждущие первыми; ниже — получившие цены и молчащие;
 * потом — те, что менеджер уже ведёт.
 */
export function AccountHandoffsPage() {
  const { accountId = '' } = useParams<{ accountId: string }>();
  const query = useGetHandoffsQuery(accountId, {
    skip: accountId === '',
    pollingInterval: POLLING_INTERVAL_MS,
  });

  return (
    <SectionCard
      title="У менеджера"
      subtitle="Чаты, которые агент передал: после цен, по просьбе клиента, из-за медиа или сбоя."
    >
      <QueryBoundary
        query={query}
        errorText="Не удалось загрузить чаты у менеджера"
        empty={
          <EmptyState
            size="compact"
            icon={<SupportAgentOutlinedIcon />}
            title="Передач пока нет"
            description="Сейчас все чаты либо у агента, либо агент их не вёл."
          />
        }
      >
        {(chats) =>
          groupHandoffs(chats).map((group) => (
            <Box key={group.title} component="section" sx={styles.group}>
              <Typography component="h3" sx={styles.groupTitle}>
                {group.title} · {group.chats.length}
              </Typography>
              <List disablePadding sx={styles.list}>
                {group.chats.map((chat) => (
                  <li key={chat.chatId}>
                    <HandoffListItem accountId={accountId} chat={chat} />
                  </li>
                ))}
              </List>
            </Box>
          ))
        }
      </QueryBoundary>
    </SectionCard>
  );
}
