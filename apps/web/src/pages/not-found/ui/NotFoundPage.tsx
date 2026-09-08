import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ROUTES } from '@/shared/config'
import { notFoundPageStyles as styles } from './NotFoundPage.styles'

export function NotFoundPage() {
  return (
    <Box sx={styles.root}>
      <Stack spacing={2} sx={styles.content}>
        <Typography variant="h4" sx={styles.code}>
          404
        </Typography>
        <Typography variant="h6">Страница не найдена</Typography>
        <Button component={RouterLink} to={ROUTES.home} variant="contained">
          На главную
        </Button>
      </Stack>
    </Box>
  )
}
