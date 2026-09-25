import type { SxStyles } from '@/shared/types';

export const pageHeaderStyles = {
  // Заголовок и действия в одной строке, пока помещаются: маленькая кнопка
  // «⋯» остаётся справа и на телефоне, крупная переносится под заголовок.
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 2,
    mb: 3,
  },
  main: {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    minWidth: 0,
    flex: '1 1 240px',
  },
  text: {
    minWidth: 0,
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 1.5,
    rowGap: 0.5,
  },
  title: {
    fontSize: { xs: 22, md: 28 },
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    overflowWrap: 'anywhere',
  },
  subtitle: {
    color: 'text.secondary',
    mt: 0.5,
  },
  actions: {
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 1,
  },
} satisfies SxStyles;
