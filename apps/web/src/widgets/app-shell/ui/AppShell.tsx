import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import LinearProgress from '@mui/material/LinearProgress'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import MenuIcon from '@mui/icons-material/Menu'
import TelegramIcon from '@mui/icons-material/Telegram'
import type { SvgIconComponent } from '@mui/icons-material'
import { useCurrentUser } from '@/entities/session'
import { AccountAvatar } from '@/entities/telegram-account'
import { LogoutButton } from '@/features/auth/logout'
import { ROUTES } from '@/shared/config'
import { BrandMark } from '@/shared/ui'
import { appShellStyles as styles } from './AppShell.styles'

interface NavItem {
  label: string
  to: string
  icon: SvgIconComponent
}

/** Разделы приложения; новые добавляются сюда. */
const NAV_ITEMS: NavItem[] = [{ label: 'Аккаунты', to: ROUTES.accounts, icon: TelegramIcon }]

/** Каркас авторизованной части: боковое меню, шапка на мобильных, контент в Outlet. */
export function AppShell() {
  const user = useCurrentUser()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const sidebar = (
    <>
      <Stack direction="row" spacing={1.5} sx={styles.brand}>
        <BrandMark sx={styles.brandMark} />
        <Typography sx={styles.brandName}>Dealogue AI</Typography>
      </Stack>

      <Box component="nav" sx={styles.nav}>
        <Typography sx={styles.navSectionLabel}>Telegram</Typography>
        <List disablePadding>
          {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
            <ListItemButton
              key={to}
              component={NavLink}
              to={to}
              selected={location.pathname.startsWith(to)}
              onClick={() => setMobileOpen(false)}
              sx={styles.navItem}
            >
              <ListItemIcon sx={styles.navIcon}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={label} slotProps={{ primary: { sx: styles.navLabel } }} />
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
  )

  return (
    <Box sx={styles.root}>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slotProps={{ paper: { sx: styles.drawerPaper } }}
        sx={styles.mobileDrawer}
      >
        {sidebar}
      </Drawer>
      <Drawer
        variant="permanent"
        slotProps={{ paper: { sx: styles.drawerPaper } }}
        sx={styles.desktopDrawer}
      >
        {sidebar}
      </Drawer>

      <Box component="main" sx={styles.main}>
        <AppBar position="sticky" elevation={0} sx={styles.mobileBar}>
          <Toolbar>
            <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Меню">
              <MenuIcon />
            </IconButton>
            <Stack direction="row" spacing={1} sx={styles.mobileBrand}>
              <BrandMark sx={styles.mobileBrandMark} />
              <Typography sx={styles.brandName}>Dealogue AI</Typography>
            </Stack>
          </Toolbar>
        </AppBar>

        <Box sx={styles.content}>
          {/* Страницы грузятся отдельными чанками — на время загрузки полоска вверху контента. */}
          <Suspense fallback={<LinearProgress sx={styles.pageLoader} />}>
            <Outlet />
          </Suspense>
        </Box>
      </Box>
    </Box>
  )
}
