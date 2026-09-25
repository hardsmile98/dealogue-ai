import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { useContinueInSandbox } from '../model/useContinueInSandbox';

interface ToSandboxButtonProps {
  accountId: string;
  chatId: string;
}

/**
 * Кнопка в шапке чата: скопировать всю переписку в песочницу и посмотреть,
 * как агент продолжит диалог. В чат ничего не уйдёт.
 */
export function ToSandboxButton({ accountId, chatId }: ToSandboxButtonProps) {
  const { continueFrom, isLoading } = useContinueInSandbox({
    accountId,
    chatId,
  });

  return (
    <Tooltip
      title="Скопировать переписку в песочницу и посмотреть, как агент продолжит диалог. В чат ничего не уйдёт."
      describeChild
    >
      <Button
        size="small"
        variant="outlined"
        startIcon={<ScienceOutlinedIcon />}
        loading={isLoading}
        loadingPosition="start"
        onClick={() => void continueFrom()}
      >
        В песочницу
      </Button>
    </Tooltip>
  );
}
