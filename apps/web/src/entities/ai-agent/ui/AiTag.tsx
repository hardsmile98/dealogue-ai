import Box from '@mui/material/Box'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'

interface AiTagProps {
  label?: string
}

/** Маленькая пометка «ИИ» у сообщения, которое отправил агент. */
export function AiTag({ label = 'ИИ' }: AiTagProps) {
  return (
    <Box
      component="span"
      title="Сообщение отправил ИИ-агент"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'primary.main',
        '& svg': { fontSize: 12 },
      }}
    >
      <SmartToyOutlinedIcon />
      {label}
    </Box>
  )
}
