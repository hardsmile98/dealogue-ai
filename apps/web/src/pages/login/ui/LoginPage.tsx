import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { LoginForm } from '@/features/auth/login'
import { BrandMark } from '@/shared/ui'
import { BRAND_HIGHLIGHTS } from './brandHighlights'
import { loginPageStyles as styles } from './LoginPage.styles'

export function LoginPage() {
  return (
    <Box sx={styles.root}>
      <Box sx={styles.brandPanel}>
        <Stack direction="row" spacing={1.5} sx={styles.brandHeader}>
          <BrandMark sx={styles.brandMark} />
          <Typography variant="h6" sx={styles.brandName}>
            Dealogue AI
          </Typography>
        </Stack>

        <Box sx={styles.brandBody}>
          <Typography variant="h4" sx={styles.brandTitle}>
            Диалоги, которые приводят к сделкам
          </Typography>
          <Typography sx={styles.brandSubtitle}>
            Войдите, чтобы вернуться к работе с клиентами.
          </Typography>

          <Stack spacing={3}>
            {BRAND_HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <Stack key={title} direction="row" spacing={2}>
                <Icon sx={styles.highlightIcon} />
                <Box>
                  <Typography sx={styles.highlightTitle}>{title}</Typography>
                  <Typography variant="body2" sx={styles.highlightText}>
                    {text}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Typography variant="body2" sx={styles.brandFooter}>
          © {new Date().getFullYear()} Dealogue AI
        </Typography>
      </Box>

      <Box sx={styles.formPanel}>
        <Paper elevation={0} sx={styles.card}>
          <Stack spacing={1} sx={styles.cardHeader}>
            <BrandMark sx={styles.cardBrandMark} />
            <Typography variant="h5" component="h1">
              Вход в аккаунт
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={styles.cardSubtitle}
            >
              Введите логин и пароль, выданные администратором
            </Typography>
          </Stack>

          <LoginForm />
        </Paper>
      </Box>
    </Box>
  )
}
