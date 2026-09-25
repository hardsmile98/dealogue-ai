import Avatar from '@mui/material/Avatar';
import type { SxProps, Theme } from '@mui/material/styles';
import { avatarColor } from '@/shared/config';

interface AccountAvatarProps {
  name: string;
  size?: number;
  sx?: SxProps<Theme>;
}

/** Первые буквы двух первых слов; `Array.from` — чтобы не резать эмодзи пополам. */
function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? '')
    .join('');
  return letters || '?';
}

/**
 * Аватар-инициалы с постоянным цветом по имени. Декоративный: имя всегда
 * написано рядом, поэтому экранный диктор его пропускает.
 */
export function AccountAvatar({ name, size = 40, sx }: AccountAvatarProps) {
  return (
    <Avatar
      aria-hidden
      sx={[
        {
          width: size,
          height: size,
          fontSize: size * 0.38,
          fontWeight: 600,
          bgcolor: avatarColor(name),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {initials(name)}
    </Avatar>
  );
}
