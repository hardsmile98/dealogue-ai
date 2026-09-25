import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { pageHeaderStyles as styles } from './PageHeader.styles';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Картинка слева от заголовка: аватар, логотип. */
  avatar?: ReactNode;
  /** Пометка справа от заголовка: статус, счётчик. */
  badge?: ReactNode;
  /** Кнопки справа. */
  actions?: ReactNode;
}

/** Заголовок страницы: h1, пояснение под ним и действия справа. */
export function PageHeader({
  title,
  subtitle,
  avatar,
  badge,
  actions,
}: PageHeaderProps) {
  return (
    <Box component="header" sx={styles.root}>
      <Box sx={styles.main}>
        {avatar}
        <Box sx={styles.text}>
          <Box sx={styles.titleRow}>
            <Typography component="h1" sx={styles.title}>
              {title}
            </Typography>
            {badge}
          </Box>
          {subtitle && (
            <Typography component="div" variant="body2" sx={styles.subtitle}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
      {actions && (
        <Stack direction="row" useFlexGap sx={styles.actions}>
          {actions}
        </Stack>
      )}
    </Box>
  );
}
