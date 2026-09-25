import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import {
  BUBBLE_ACTIONS_CLASS,
  chatBubbleStyles as styles,
} from './ChatBubble.styles';

interface ChatBubbleProps {
  direction: 'in' | 'out';
  /** `milestone` — тело вехи из библиотеки: пунктирная рамка и свой фон. */
  tone?: 'default' | 'milestone';
  /** Пометки над текстом: «Первое сообщение», «Веха из библиотеки». */
  header?: ReactNode;
  /** Строка под текстом: время, галочки, пометки. */
  meta?: ReactNode;
  /** Подсказка при наведении на строку времени — полная дата. */
  metaTitle?: string;
  /** Действия у сообщения: видны при наведении и фокусе, на тач-экранах — всегда. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Пузырь сообщения — один для переписки в чате и в песочнице: входящие
 * слева на белом, исходящие справа на цветном. Что внутри — решает
 * вызывающий: текст, пометки, действия.
 */
export function ChatBubble({
  direction,
  tone = 'default',
  header,
  meta,
  metaTitle,
  actions,
  children,
}: ChatBubbleProps) {
  const incoming = direction === 'in';

  return (
    <Box
      sx={[
        styles.row,
        incoming ? styles.rowIn : styles.rowOut,
        Boolean(actions) && styles.rowWithActions,
      ]}
    >
      <Box
        sx={[
          styles.bubble,
          incoming ? styles.bubbleIn : styles.bubbleOut,
          tone === 'milestone' && styles.bubbleMilestone,
        ]}
      >
        {header && <Box sx={styles.header}>{header}</Box>}
        {children}
        {(meta || actions) && (
          <Box sx={styles.meta} title={metaTitle}>
            {actions && (
              <Box className={BUBBLE_ACTIONS_CLASS} sx={styles.actions}>
                {actions}
              </Box>
            )}
            {meta}
          </Box>
        )}
      </Box>
    </Box>
  );
}
