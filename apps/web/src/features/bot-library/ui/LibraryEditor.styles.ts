import type { SxStyles } from '@/shared/types';

export const libraryEditorStyles = {
  toolbar: {
    display: 'flex',
    flexDirection: { xs: 'column', sm: 'row' },
    alignItems: { xs: 'stretch', sm: 'center' },
    gap: 1.5,
  },
  kindSelect: {
    minWidth: { sm: 240 },
  },
  search: {
    flexGrow: 1,
  },
  addButton: {
    flexShrink: 0,
  },
  summary: {
    color: 'text.secondary',
  },
  languageSelect: {
    minWidth: 110,
  },
  genderSelect: {
    minWidth: 150,
  },
  item: {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    p: 1.25,
  },
  disabled: {
    bgcolor: 'background.subtle',
    '& .library-item-text': { opacity: 0.6 },
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
  },
  itemMain: {
    flexGrow: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: 500,
    fontSize: 14,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 0.5,
    mt: 0.5,
  },
  preview: {
    mt: 0.75,
    fontSize: 13,
    color: 'text.secondary',
    whiteSpace: 'pre-wrap',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
} satisfies SxStyles;
