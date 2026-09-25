import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { APP_NAME } from '@/shared/config';
import { useDocumentTitle } from '@/shared/lib';
import { BrandMark } from '@/shared/ui';
import { useSessionExpired } from '@/entities/session';
import { LoginForm } from '@/features/auth/login';
import { BRAND_HIGHLIGHTS } from './brandHighlights';
import { loginPageStyles as styles } from './LoginPage.styles';

export function LoginPage() {
  const expired = useSessionExpired();
  useDocumentTitle('Вход');

  return (
    <Box sx={styles.root}>
      <Box sx={styles.brandPanel}>
        <Stack direction="row" spacing={1.5} sx={styles.brandHeader}>
          <BrandMark sx={styles.brandMark} />
          <Typography variant="h6" component="p" sx={styles.brandName}>
            {APP_NAME}
          </Typography>
        </Stack>

        <Box sx={styles.brandBody}>
          <Typography variant="h4" component="p" sx={styles.brandTitle}>
            Диалоги, которые приводят к сделкам
          </Typography>
          <Typography sx={styles.brandSubtitle}>
            Войдите, чтобы вернуться к работе с клиентами.
          </Typography>

          <Stack spacing={3} component="ul" sx={styles.highlights}>
            {BRAND_HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <Stack key={title} component="li" direction="row" spacing={2}>
                <Icon sx={styles.highlightIcon} aria-hidden />
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
          © {new Date().getFullYear()} {APP_NAME}
        </Typography>
      </Box>

      <Box component="main" sx={styles.formPanel}>
        <Paper variant="outlined" sx={styles.card}>
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

          {expired && (
            <Alert severity="warning" sx={styles.expired}>
              Сессия истекла — войдите снова.
            </Alert>
          )}

          <LoginForm />
        </Paper>
      </Box>
    </Box>
  );
}
