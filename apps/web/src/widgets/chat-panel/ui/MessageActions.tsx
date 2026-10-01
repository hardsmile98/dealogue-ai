import { memo } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { chatThreadStyles as styles } from './ChatThread.styles';

interface MessageActionsProps {
  messageId: string;
  onToSandbox: (messageId: string) => void;
  disabled?: boolean;
}

/**
 * Действие у сообщения: «продолжить в песочнице с этого места». Лёгкая
 * кнопка без своих запросов — запросы держит лента, одна на все сообщения.
 */
export const MessageActions = memo(function MessageActions({
  messageId,
  onToSandbox,
  disabled = false,
}: MessageActionsProps) {
  return (
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
