const number = new Intl.NumberFormat('ru-RU')
const percent = new Intl.NumberFormat('ru-RU', {
  style: 'percent',
  maximumFractionDigits: 0,
})

export function formatNumber(value: number): string {
  return number.format(value)
}

/** Доля part/whole → «42 %»; при пустом целом — прочерк. */
export function formatShare(part: number, whole: number): string {
  if (whole === 0) return '—'
  return percent.format(part / whole)
}

/** Склонение: pluralize(3, ['диалог', 'диалога', 'диалогов']) → «3 диалога». */
export function pluralize(
  count: number,
  forms: [string, string, string],
  withNumber = true,
): string {
  const abs = Math.abs(count) % 100
  const last = abs % 10
  let form = forms[2]
  if (abs < 10 || abs > 20) {
    if (last === 1) form = forms[0]
    else if (last >= 2 && last <= 4) form = forms[1]
  }
  return withNumber ? `${formatNumber(count)} ${form}` : form
}

/** +79151234567 → +7 915 123-45-67; нестандартную длину оставляет как есть. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 11) return raw
  return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`
}
