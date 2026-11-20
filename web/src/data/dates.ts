export function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1, 12)
}

export function addDays(value: string, amount: number): string {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + amount)
  return localDateKey(date)
}

export function startOfWeek(value: string, firstDay: 0 | 1 = 1): string {
  const date = parseLocalDate(value)
  const back = (date.getDay() - firstDay + 7) % 7
  date.setDate(date.getDate() - back)
  return localDateKey(date)
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }): string {
  return new Intl.DateTimeFormat(undefined, options).format(parseLocalDate(value))
}

export function formatTime(value: string, format: '12h' | '24h' = '12h'): string {
  const [hours, minutes] = value.split(':').map(Number)
  const date = new Date(2000, 0, 1, hours ?? 0, minutes ?? 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: format === '12h' }).format(date)
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

export function durationLabel(totalSeconds: number): string {
  if (totalSeconds > 0 && totalSeconds < 60) return `${Math.round(totalSeconds)}s`
  const minutes = Math.max(0, Math.floor(totalSeconds / 60))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}h ${rest}m` : `${rest}m`
}

export function dateTimeTimestamp(date: string, time: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0).getTime()
}
