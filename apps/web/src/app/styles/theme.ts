import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#4f46e5', light: '#6366f1', dark: '#4338ca' },
    background: { default: '#f5f6fa', paper: '#ffffff' },
    text: { primary: '#101828', secondary: '#667085' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
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
  },
})
