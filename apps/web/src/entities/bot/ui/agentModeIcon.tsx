import type { ReactElement } from 'react';
import PowerSettingsNewOutlinedIcon from '@mui/icons-material/PowerSettingsNewOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import type { ChatMode } from '@/shared/api';

/** Иконка режима — одна и та же в значке строки и в фильтре списка чатов. */
export function agentModeIcon(mode: ChatMode): ReactElement {
  if (mode === 'auto') return <SmartToyOutlinedIcon />;
  if (mode === 'manager') return <SupportAgentOutlinedIcon />;
  return <PowerSettingsNewOutlinedIcon />;
}
