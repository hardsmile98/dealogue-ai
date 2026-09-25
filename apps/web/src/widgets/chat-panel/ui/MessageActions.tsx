import { memo } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { chatThreadStyles as styles } from './ChatThread.styles';

interface MessageActionsProps {
  messageId: string;
  /** Исходящее можно добавить в примеры для агента. */
  outgoing: boolean;
  onToSandbox: (messageId: string) => void;
  onToExamples: (messageId: string) => void;
  disabled?: boolean;
}

/**
 * Действия у сообщения: «продолжить в песочнице с этого места» и «в
 * примеры». Лёгкие кнопки без своих запросов — запросы держит лента,
 * одна на все сообщения.
 */
export const MessageActions = memo(function MessageActions({
  messageId,
  outgoing,
  onToSandbox,
  onToExamples,
  disabled = false,
}: MessageActionsProps) {
  return (
    <>
      <Tooltip title="Продолжить в песочнице с этого сообщения">
        <IconButton
          size="small"
          aria-label="Продолжить в песочнице с этого сообщения"
          disabled={disabled}
          onClick={() => onToSandbox(messageId)}
          sx={styles.messageAction}
        >
          <ScienceOutlinedIcon />
        </IconButton>
      </Tooltip>
      {outgoing && (
        <Tooltip title="В примеры для агента">
          <IconButton
            size="small"
            aria-label="В примеры для агента"
            onClick={() => onToExamples(messageId)}
            sx={styles.messageAction}
          >
            <BookmarkAddOutlinedIcon />
          </IconButton>
        </Tooltip>
      )}
    </>
  );
});

interface AgentTurnMarkerProps {
  turnId: string;
  onOpen: (turnId: string) => void;
}

/** Пометка «ответ агента» у сообщения: открывает его ход в журнале. */
export const AgentTurnMarker = memo(function AgentTurnMarker({
  turnId,
  onOpen,
}: AgentTurnMarkerProps) {
  return (
    <Tooltip title="Ответ агента — открыть ход в журнале">
      <IconButton
        size="small"
        aria-label="Ответ агента: открыть ход в журнале"
        onClick={() => onOpen(turnId)}
        sx={styles.messageAction}
      >
        <SmartToyOutlinedIcon />
      </IconButton>
    </Tooltip>
  );
});
