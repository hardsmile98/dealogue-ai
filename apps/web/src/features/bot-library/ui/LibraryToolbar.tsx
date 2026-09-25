import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { LIBRARY_KINDS } from '@/shared/api';
import type { LibraryKind } from '@/shared/api';
import { LIBRARY_KIND_LABELS } from '@/entities/bot';
import type { KindFilter } from '../lib/library';
import { libraryEditorStyles as styles } from './LibraryEditor.styles';

interface LibraryToolbarProps {
  kind: KindFilter;
  onKindChange: (kind: KindFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  total: number;
  counts: Map<LibraryKind, number>;
  onAdd: () => void;
}

/** Фильтр по виду со счётчиками, поиск и «Добавить». */
export function LibraryToolbar({
  kind,
  onKindChange,
  search,
  onSearchChange,
  total,
  counts,
  onAdd,
}: LibraryToolbarProps) {
  return (
    <Box sx={styles.toolbar}>
      <TextField
        select
        size="small"
        label="Вид"
        value={kind}
        onChange={(event) => onKindChange(event.target.value as KindFilter)}
        sx={styles.kindSelect}
      >
        <MenuItem value="all">Все ({total})</MenuItem>
        {LIBRARY_KINDS.map((option) => (
          <MenuItem key={option} value={option}>
            {LIBRARY_KIND_LABELS[option]} ({counts.get(option) ?? 0})
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        type="search"
        label="Поиск по названию и тексту"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        sx={styles.search}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          },
        }}
      />
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={onAdd}
        sx={styles.addButton}
      >
        Добавить
      </Button>
    </Box>
  );
}
