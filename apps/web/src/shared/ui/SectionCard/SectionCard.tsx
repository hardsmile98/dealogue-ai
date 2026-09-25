import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { sectionCardStyles as styles } from './SectionCard.styles';

interface SectionCardProps {
  title?: ReactNode;
  /** Пояснение под заголовком: зачем этот блок и что здесь настраивают. */
  subtitle?: ReactNode;
  /** Кнопка или переключатель справа от заголовка. */
  action?: ReactNode;
  /** Растянуть по высоте — для карточек одного ряда Grid. */
  fullHeight?: boolean;
  children: ReactNode;
}

/**
 * Карточка-раздел: заголовок, пояснение и содержимое. Рамку, скругление и
 * внутренние отступы задаёт тема (`MuiCard`, `MuiCardContent`), поэтому у
 * всех разделов приложения они одинаковые.
 */
export function SectionCard({
  title,
  subtitle,
  action,
  fullHeight,
  children,
}: SectionCardProps) {
  return (
    <Card sx={fullHeight ? styles.fullHeight : undefined}>
      <CardContent>
        {(title || action) && (
          <Stack direction="row" spacing={1} sx={styles.header}>
            <Box sx={styles.heading}>
              {title && (
                <Typography component="h2" variant="subtitle1">
                  {title}
                </Typography>
              )}
              {subtitle && (
                <Typography variant="body2" sx={styles.subtitle}>
                  {subtitle}
                </Typography>
              )}
            </Box>
            {action}
          </Stack>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
