import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ROUTES } from '@/shared/config';
import { useDocumentTitle } from '@/shared/lib';
import { notFoundPageStyles as styles } from './NotFoundPage.styles';

export function NotFoundPage() {
  useDocumentTitle('Страница не найдена');

  return (
    <Box component="main" sx={styles.root}>
      <Stack spacing={2} sx={styles.content}>
        <Typography variant="h4" component="p" sx={styles.code}>
          404
        </Typography>
        <Typography variant="h6" component="h1">
          Страница не найдена
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Возможно, ссылка устарела или в адресе опечатка.
        </Typography>
        <Button component={RouterLink} to={ROUTES.home} variant="contained">
          На главную
        </Button>
      </Stack>
    </Box>
  );
}
