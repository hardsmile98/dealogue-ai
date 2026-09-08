import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCurrentUser } from '@/entities/session'
import { LogoutButton } from '@/features/auth/logout'
import { homePageStyles as styles } from './HomePage.styles'

/** Временная заглушка вместо приложения: подтверждает, что вход прошёл успешно. */
export function HomePage() {
  const user = useCurrentUser()

  if (!user) return null

  return (
    <Box sx={styles.root}>
      <Paper elevation={0} sx={styles.card}>
        <Stack spacing={2} sx={styles.content}>
          <Avatar sx={styles.avatar}>
            {user.name.charAt(0).toUpperCase()}
          </Avatar>
          <Box>
            <Typography variant="h6">{user.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              Вы вошли как {user.login}
            </Typography>
          </Box>
          <LogoutButton />
        </Stack>
      </Paper>
    </Box>
  )
}
