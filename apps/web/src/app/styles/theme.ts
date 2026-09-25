import { createTheme } from '@mui/material/styles';

/**
 * Тема приложения. Цвета, скругления и типографика — только отсюда:
 * компоненты ссылаются на токены (`'background.subtle'`, `'chat.outgoing'`),
 * а не на hex. Свои токены описаны типами в `shared/types/theme.d.ts`.
 *
 * Скругление: `shape.borderRadius` = 12px у карточек, бумаги и панелей.
 * В `sx` число у `borderRadius` — множитель этого значения (`1` = 12px),
 * поэтому для карточек его не пишут вовсе, а мелкие детали задают строкой.
 */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#4f46e5', light: '#6366f1', dark: '#4338ca' },
    secondary: { main: '#6d28d9', light: '#8b5cf6', dark: '#5b21b6' },
    background: { default: '#f5f6fa', paper: '#ffffff', subtle: '#f7f7fb' },
    text: { primary: '#101828', secondary: '#667085' },
    chat: {
      outgoing: '#e0e7ff',
      milestone: '#ede9fe',
      milestoneBorder: '#a78bfa',
      milestoneText: '#6d28d9',
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { sizeLarge: { paddingBlock: 12 } },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
    },
    MuiCardContent: {
      styleOverrides: {
        root: ({ theme }) => ({
          padding: theme.spacing(2.5),
          '&:last-child': { paddingBottom: theme.spacing(2.5) },
          [theme.breakpoints.up('sm')]: {
            padding: theme.spacing(3),
            '&:last-child': { paddingBottom: theme.spacing(3) },
          },
        }),
      },
    },
    // Пять вкладок аккаунта не помещаются в телефон — прокручиваются вбок.
    MuiTabs: {
      defaultProps: {
        variant: 'scrollable',
        scrollButtons: 'auto',
        allowScrollButtonsMobile: true,
      },
    },
    MuiTab: {
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiToggleButton: {
      styleOverrides: { root: { paddingInline: 14, whiteSpace: 'nowrap' } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({ borderColor: theme.palette.divider }),
        head: ({ theme }) => ({
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.3,
          color: theme.palette.text.secondary,
          whiteSpace: 'nowrap',
        }),
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontSize: 18, fontWeight: 600 } },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: ({ theme }) => ({ padding: theme.spacing(1.5, 3, 2.5) }),
      },
    },
  },
});
