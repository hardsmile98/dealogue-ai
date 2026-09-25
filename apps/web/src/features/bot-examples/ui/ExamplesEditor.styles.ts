import type { SxStyles } from '@/shared/types';

export const examplesEditorStyles = {
  toolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  stageTitle: {
    mb: 1,
  },
  item: {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    p: 1.5,
  },
  disabled: {
    bgcolor: 'background.subtle',
    // Приглушаем текст, а не кнопки: их по-прежнему нужно найти и нажать.
    '& > *:not(:first-child)': { opacity: 0.6 },
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
  },
  situation: {
    fontWeight: 500,
    fontSize: 14,
    flexGrow: 1,
    minWidth: 0,
  },
  text: {
    fontSize: 13,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  label: {
    fontSize: 12,
    color: 'text.secondary',
    mt: 0.75,
  },
} satisfies SxStyles;
