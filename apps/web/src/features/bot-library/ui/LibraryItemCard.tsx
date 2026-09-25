import { memo } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import type { LibraryItemDto } from '@/shared/api';
import { ConfirmAction } from '@/shared/ui';
import { CLIENT_GENDER_LABELS, LIBRARY_KIND_LABELS } from '@/entities/bot';
import { categoryTitle } from '../lib/library';
import { libraryEditorStyles as styles } from './LibraryEditor.styles';

interface LibraryItemCardProps {
  item: LibraryItemDto;
  onToggle: (item: LibraryItemDto, enabled: boolean) => void;
  onEdit: (item: LibraryItemDto) => void;
  onDelete: (item: LibraryItemDto) => Promise<unknown>;
}

/**
 * Текст библиотеки: название, пометки (вид, язык, для кого, категория) и
 * начало текста. Список бывает на сотни строк, поэтому карточка мемоизирована.
 */
export const LibraryItemCard = memo(function LibraryItemCard({
  item,
  onToggle,
  onEdit,
  onDelete,
}: LibraryItemCardProps) {
  const category = categoryTitle(item.category);

  return (
    <Box sx={[styles.item, !item.enabled && styles.disabled]}>
      <Box sx={styles.itemHeader}>
        <Box sx={styles.itemMain} className="library-item-text">
          <Typography sx={styles.title}>{item.title}</Typography>
          <Box sx={styles.chips}>
            <Chip
              size="small"
              variant="outlined"
              label={LIBRARY_KIND_LABELS[item.kind]}
            />
            <Chip size="small" variant="outlined" label={item.language} />
            {item.gender && (
              <Chip
                size="small"
                variant="outlined"
                label={CLIENT_GENDER_LABELS[item.gender]}
              />
            )}
            {category && (
              <Chip size="small" variant="outlined" label={category} />
            )}
            {item.seedKey && <Chip size="small" label="стандартный" />}
            {!item.enabled && <Chip size="small" label="выключен" />}
          </Box>
        </Box>
        <Tooltip
          describeChild
          title={
            item.enabled
              ? 'Агент использует текст'
              : 'Агент не использует текст'
          }
        >
          <Switch
            size="small"
            checked={item.enabled}
            onChange={(event) => onToggle(item, event.target.checked)}
            slotProps={{
              input: { 'aria-label': `Текст «${item.title}» включён` },
            }}
          />
        </Tooltip>
        <Tooltip title="Изменить">
          <IconButton
            size="small"
            aria-label={`Изменить «${item.title}»`}
            onClick={() => onEdit(item)}
          >
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <ConfirmAction
          question="Удалить текст из библиотеки?"
          description={
            item.seedKey
              ? `«${item.title}» вернётся при повторной загрузке стандартной библиотеки.`
              : `«${item.title}» удалится насовсем.`
          }
          confirmLabel="Удалить"
          destructive
          errorText="Не удалось удалить текст"
          onConfirm={() => onDelete(item)}
        >
          {(ask) => (
            <Tooltip title="Удалить">
              <IconButton
                size="small"
                aria-label={`Удалить «${item.title}»`}
                onClick={ask}
              >
                <DeleteOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </ConfirmAction>
      </Box>
      <Typography sx={styles.preview} className="library-item-text">
        {item.text}
      </Typography>
    </Box>
  );
});
