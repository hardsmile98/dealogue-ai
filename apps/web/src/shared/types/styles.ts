import type { SxProps, Theme } from '@mui/material/styles'

/**
 * Набор sx-объектов одного компонента.
 * Живёт в `<Component>.styles.ts` рядом с самим компонентом,
 * чтобы разметка не смешивалась со стилями.
 */
export type SxStyles = Record<string, SxProps<Theme>>
