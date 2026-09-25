import { Suspense, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import MenuIcon from '@mui/icons-material/Menu';
import TelegramIcon from '@mui/icons-material/Telegram';
import type { SvgIconComponent } from '@mui/icons-material';
import { APP_NAME, ROUTES } from '@/shared/config';
import { BrandMark } from '@/shared/ui';
import { useCurrentUser } from '@/entities/session';
import { AccountAvatar } from '@/entities/telegram-account';
import { LogoutButton } from '@/features/auth/logout';
import { appShellStyles as styles } from './AppShell.styles';

interface NavItem {
  label: string;
  to: string;
  icon: SvgIconComponent;
}

/** Разделы приложения; новые добавляются сюда. */
const NAV_ITEMS: NavItem[] = [
  { label: 'Аккаунты', to: ROUTES.accounts, icon: TelegramIcon },
];

const MAIN_ID = 'main-content';

/** Каркас авторизованной части: боковое меню, шапка на мобильных, контент в Outlet. */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <Box sx={styles.root}>
      <Box component="a" href={`#${MAIN_ID}`} sx={styles.skipLink}>
        Перейти к содержимому
      </Box>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={closeMobile}
        slotProps={{ paper: { sx: styles.drawerPaper } }}
        sx={styles.mobileDrawer}
      >
        <Sidebar onNavigate={closeMobile} />
      </Drawer>
      <Drawer
        variant="permanent"
        slotProps={{ paper: { sx: styles.drawerPaper } }}
        sx={styles.desktopDrawer}
      >
        <Sidebar />
      </Drawer>

      <Box sx={styles.main}>
        <AppBar position="sticky" elevation={0} sx={styles.mobileBar}>
          <Toolbar>
            <IconButton
              edge="start"
              onClick={() => setMobileOpen(true)}
              aria-label="Открыть меню"
            >
              <MenuIcon />
            </IconButton>
            <Stack direction="row" spacing={1} sx={styles.mobileBrand}>
              <BrandMark sx={styles.mobileBrandMark} />
              <Typography sx={styles.brandName}>{APP_NAME}</Typography>
            </Stack>
          </Toolbar>
        </AppBar>

        <Box component="main" id={MAIN_ID} tabIndex={-1} sx={styles.content}>
          {/* Страницы грузятся отдельными чанками — на время загрузки полоска вверху контента. */}
          <Suspense
            fallback={
              <LinearProgress
                sx={styles.pageLoader}
                aria-label="Загружаем страницу"
              />
            }
          >
            <Outlet />
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
}

/** Логотип, разделы и текущий пользователь с кнопкой выхода. */
function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  const location = useLocation();

  return (
    <>
      <Stack direction="row" spacing={1.5} sx={styles.brand}>
        <BrandMark sx={styles.brandMark} />
        <Typography sx={styles.brandName}>{APP_NAME}</Typography>
      </Stack>

      <Box component="nav" aria-label="Разделы" sx={styles.nav}>
        <Typography sx={styles.navSectionLabel}>Telegram</Typography>
        <List disablePadding>
          {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
            <ListItemButton
              key={to}
              component={NavLink}
              to={to}
              selected={location.pathname.startsWith(to)}
              onClick={onNavigate}
              sx={styles.navItem}
            >
              <ListItemIcon sx={styles.navIcon}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={label}
                slotProps={{ primary: { sx: styles.navLabel } }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>

      {user && (
        <Stack direction="row" spacing={1.5} sx={styles.user}>
          <AccountAvatar name={user.name} size={36} />
          <Box sx={styles.userText}>
            <Typography sx={styles.userName}>{user.name}</Typography>
            <Typography sx={styles.userLogin}>{user.login}</Typography>
          </Box>
          <LogoutButton variant="icon" />
        </Stack>
      )}
    </>
  );
}
