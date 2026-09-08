import Avatar from '@mui/material/Avatar'
import type { SxProps, Theme } from '@mui/material/styles'

interface AccountAvatarProps {
  name: string
  size?: number
  sx?: SxProps<Theme>
}

const AVATAR_COLORS = ['#4f46e5', '#0e7490', '#b45309', '#be185d', '#047857', '#6d28d9']

/** Детерминированный цвет по имени, чтобы аватар не «прыгал» между рендерами. */
function colorFor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function AccountAvatar({ name, size = 40, sx }: AccountAvatarProps) {
  return (
    <Avatar
      sx={[
        {
          width: size,
          height: size,
          fontSize: size * 0.38,
          fontWeight: 600,
          bgcolor: colorFor(name),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {initials(name)}
    </Avatar>
  )
}
