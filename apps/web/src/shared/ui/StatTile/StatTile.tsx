import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import { statTileStyles as styles } from './StatTile.styles'

export interface StatTileDelta {
  /** Относительное изменение в процентах (может быть отрицательным) или null, если сравнивать не с чем. */
  percent: number | null
  /** С чем сравниваем: «к прошлым 7 дням». */
  versus: string
}

interface StatTileProps {
  label: string
  value: ReactNode
  /** Подпись под значением: доля, пояснение. */
  caption?: ReactNode
  delta?: StatTileDelta
  /** Цветной маркер серии рядом с подписью, если плитка соответствует серии графика. */
  swatchColor?: string
}

/** Плитка с одним показателем: подпись, крупное число, дельта или пояснение. */
export function StatTile({ label, value, caption, delta, swatchColor }: StatTileProps) {
  return (
    <Paper elevation={0} sx={styles.root}>
      <Typography component="div" sx={styles.label}>
        {swatchColor && <Box sx={[styles.swatch, { bgcolor: swatchColor }]} />}
        {label}
      </Typography>
      <Typography component="div" sx={styles.value}>
        {value}
      </Typography>
      {(caption || delta) && (
        <Typography component="div" sx={styles.caption}>
          {delta && <DeltaText delta={delta} />}
          {caption}
        </Typography>
      )}
    </Paper>
  )
}

function DeltaText({ delta }: { delta: StatTileDelta }) {
  if (delta.percent === null) {
    return <Box component="span">нет данных за прошлый период</Box>
  }
  const rounded = Math.round(delta.percent)
  if (rounded === 0) {
    return (
      <Box component="span">
        <Box component="span" sx={styles.deltaFlat}>
          без изменений
        </Box>{' '}
        {delta.versus}
      </Box>
    )
  }
  const up = rounded > 0
  return (
    <Box component="span">
      <Box component="span" sx={up ? styles.deltaUp : styles.deltaDown}>
        {up ? (
          <ArrowUpwardIcon sx={{ fontSize: 14 }} />
        ) : (
          <ArrowDownwardIcon sx={{ fontSize: 14 }} />
        )}
        {Math.abs(rounded)} %
      </Box>{' '}
      {delta.versus}
    </Box>
  )
}
