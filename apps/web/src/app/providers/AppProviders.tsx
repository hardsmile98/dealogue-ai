import type { ReactNode } from 'react';
import { Provider as StoreProvider } from 'react-redux';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { NotificationsProvider } from '@/shared/ui';
import { store } from '../store';
import { theme } from '../styles/theme';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <StoreProvider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <NotificationsProvider>{children}</NotificationsProvider>
      </ThemeProvider>
    </StoreProvider>
  );
}
