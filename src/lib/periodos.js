// Períodos de tiempo compartidos por los reportes (ventas, movimientos de inventario, auditoría).
export const TZ = 'America/Santiago'

export const PERIODOS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_anterior', label: 'Mes anterior' },
  { key: 'trimestre', label: 'Últimos 3 meses' },
  { key: 'rango', label: 'Personalizado' },
]

// Períodos largos (un año y dos años), solo para los reportes que miran el negocio completo.
// Cuentan el mes actual y los 11 (o 23) anteriores, igual que "Últimos 3 meses".
export const PERIODOS_ANUALES = [
  { key: 'anio', label: 'Últimos 12 meses' },
  { key: 'dos_anios', label: 'Últimos 24 meses' },
]
export const PERIODOS_REPORTES = [...PERIODOS.slice(0, -1), ...PERIODOS_ANUALES, PERIODOS[PERIODOS.length - 1]]

export const diaDe = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
export const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: TZ })

// Límites del período como instantes (medianoche local). `hasta` es exclusivo.
// Devuelve null si es "rango" y faltan fechas.
export function limites(periodo, desdeTxt, hastaTxt) {
  const hoy = new Date()
  const y = hoy.getFullYear(), m = hoy.getMonth(), d = hoy.getDate()
  if (periodo === 'hoy') return { desde: new Date(y, m, d), hasta: new Date(y, m, d + 1) }
  if (periodo === 'semana') {
    const lunes = d - ((hoy.getDay() + 6) % 7)
    return { desde: new Date(y, m, lunes), hasta: new Date(y, m, lunes + 7) }
  }
  if (periodo === 'mes') return { desde: new Date(y, m, 1), hasta: new Date(y, m + 1, 1) }
  if (periodo === 'mes_anterior') return { desde: new Date(y, m - 1, 1), hasta: new Date(y, m, 1) }
  if (periodo === 'trimestre') return { desde: new Date(y, m - 2, 1), hasta: new Date(y, m + 1, 1) }
  if (periodo === 'anio') return { desde: new Date(y, m - 11, 1), hasta: new Date(y, m + 1, 1) }
  if (periodo === 'dos_anios') return { desde: new Date(y, m - 23, 1), hasta: new Date(y, m + 1, 1) }
  if (!desdeTxt || !hastaTxt) return null
  const [a, b, c] = desdeTxt.split('-').map(Number)
  const [e, f, g] = hastaTxt.split('-').map(Number)
  return { desde: new Date(a, b - 1, c), hasta: new Date(e, f - 1, g + 1) }
}

export function etiquetaDia(clave) {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const ayer = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: TZ })
  if (clave === hoy) return 'Hoy'
  if (clave === ayer) return 'Ayer'
  return new Date(clave + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
