import '@mui/material/styles';

/**
 * Свои токены темы. Значения задаёт `app/styles/theme.ts`, здесь — только
 * типы, чтобы `theme.palette.chat` и `bgcolor: 'background.subtle'` были
 * известны TypeScript во всех слоях.
 */
declare module '@mui/material/styles' {
  interface TypeBackground {
    /** Подложка под лентой переписки и служебными блоками — чуть темнее default. */
    subtle: string;
  }

  interface ChatPalette {
    /** Пузырь исходящего сообщения. */
    outgoing: string;
    /** Пузырь вехи из библиотеки (диагностика, услуги, цены) в песочнице. */
    milestone: string;
    milestoneBorder: string;
    milestoneText: string;
  }

  interface Palette {
    chat: ChatPalette;
  }

  interface PaletteOptions {
    chat?: Partial<ChatPalette>;
  }
}
