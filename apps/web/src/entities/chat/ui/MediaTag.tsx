import Box from '@mui/material/Box';
import type { SvgIconComponent } from '@mui/icons-material';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import AudiotrackOutlinedIcon from '@mui/icons-material/AudiotrackOutlined';
import EmojiEmotionsOutlinedIcon from '@mui/icons-material/EmojiEmotionsOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import MicNoneOutlinedIcon from '@mui/icons-material/MicNoneOutlined';
import PhotoOutlinedIcon from '@mui/icons-material/PhotoOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import type { MediaKind } from '@/shared/api';
import { messageBubbleStyles as styles } from './MessageBubble.styles';

const MEDIA: Record<MediaKind, { label: string; icon: SvgIconComponent }> = {
  photo: { label: 'Фото', icon: PhotoOutlinedIcon },
  voice: { label: 'Голосовое', icon: MicNoneOutlinedIcon },
  video: { label: 'Видео', icon: VideocamOutlinedIcon },
  video_note: { label: 'Видеосообщение', icon: VideocamOutlinedIcon },
  audio: { label: 'Аудио', icon: AudiotrackOutlinedIcon },
  document: { label: 'Файл', icon: InsertDriveFileOutlinedIcon },
  sticker: { label: 'Стикер', icon: EmojiEmotionsOutlinedIcon },
  other: { label: 'Вложение', icon: AttachFileOutlinedIcon },
};

function isMediaKind(kind: string): kind is MediaKind {
  return kind in MEDIA;
}

/**
 * Пометка вложения над текстом: «Фото», «Голосовое». Сами файлы в веб не
 * приходят, но менеджеру важно видеть, что клиент прислал медиа — агент в
 * таком чате не отвечает. Вид — строка: песочница присылает его без типа.
 */
export function MediaTag({ kind }: { kind: string }) {
  const { label, icon: Icon } = isMediaKind(kind) ? MEDIA[kind] : MEDIA.other;

  return (
    <Box component="span" sx={styles.mediaTag}>
      <Icon aria-hidden />
      {label}
    </Box>
  );
}
