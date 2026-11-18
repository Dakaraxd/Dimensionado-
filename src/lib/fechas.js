// Fechas siempre en zona horaria de Chile continental.
// toISOString() devuelve la fecha UTC: después de las 21:00 (UTC-3) el día
// "salta" al siguiente, corriendo cuotas y agendamientos. Estos helpers evitan eso.

const TZ = 'America/Santiago'

// 'en-CA' formatea como YYYY-MM-DD
export function hoyChile() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

// Para fechas construidas con componentes locales (new Date(año, mes, día)):
// formatea en la zona local sin pasar por UTC.
export function aYMD(date) {
  return date.toLocaleDateString('en-CA')
}
// Hora actual de Chile (0–23)
export function horaChile(ahora = new Date()) {
  const h = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(ahora), 10)
  return Number.isFinite(h) ? h : 0
}

// Hora y minutos de Chile para mostrar (ej: "15:42")
export function horaMinutosChile(ahora = new Date()) {
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ahora)
}
