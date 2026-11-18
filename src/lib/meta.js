// Cálculos de la meta anual de ventas (planchas vendidas). Funciones puras, sin acceso a la base.
//
// Regla de la meta del año N:
//   base  = lo que el subgerente ingresó para ese año (si existe)
//           o, si no, las planchas realmente vendidas en N-1 según el sistema.
//   meta  = base + 25 % (el porcentaje se puede cambiar por año).
// Así, al llegar un año nuevo la meta se calcula sola con las ventas reales del anterior,
// salvo que el subgerente prefiera ingresar otra cifra.

export const PORCENTAJE_META = 25
const TZ = 'America/Santiago'

export const HITOS = [
  { pct: 25, icono: '🥉', nombre: 'Primer hito' },
  { pct: 50, icono: '🥈', nombre: 'Mitad del camino' },
  { pct: 75, icono: '🥇', nombre: 'Recta final' },
  { pct: 100, icono: '🏆', nombre: 'Meta cumplida' },
]

// Fecha de hoy en Chile (el año cambia a la medianoche de Chile, no a la de UTC)
export function fechaChile(fecha = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(fecha).map(x => [x.type, x.value])
  )
  return { anio: Number(p.year), mes: Number(p.month), dia: Number(p.day) }
}

export const esBisiesto = (anio) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
export const diasDelAnio = (anio) => (esBisiesto(anio) ? 366 : 365)

// Número de día dentro del año (1 de enero = 1)
export function diaDelAnio({ anio, mes, dia }) {
  return Math.round((Date.UTC(anio, mes - 1, dia) - Date.UTC(anio, 0, 1)) / 86400000) + 1
}

const redondear = (n, decimales = 1) => { const f = 10 ** decimales; return Math.round(n * f) / f }

export function calcularMeta({ hoy, totalAnio = 0, totalAnioAnterior = 0, fila = null }) {
  const anio = hoy.anio
  const total = Math.max(0, Math.round(totalAnio))

  // Base de la meta: lo ingresado por el subgerente, o lo vendido realmente el año anterior
  const manual = fila && Number.isFinite(Number(fila.ventas_anio_anterior)) ? Number(fila.ventas_anio_anterior) : null
  let base = null
  let origenBase = null
  if (manual !== null && manual > 0) { base = manual; origenBase = 'manual' }
  else if (totalAnioAnterior > 0) { base = Math.round(totalAnioAnterior); origenBase = 'sistema' }

  const porcentaje = fila && Number.isFinite(Number(fila.porcentaje)) ? Number(fila.porcentaje) : PORCENTAJE_META
  const meta = base ? Math.ceil(base * (1 + porcentaje / 100)) : null

  const diasAnio = diasDelAnio(anio)
  const diasTranscurridos = Math.min(diasAnio, Math.max(1, diaDelAnio(hoy)))
  const diasRestantes = diasAnio - diasTranscurridos
  const ritmoActualDia = total / diasTranscurridos
  // Con muy pocos días de datos la proyección no es confiable
  const proyeccionCierre = diasTranscurridos >= 15 && total > 0 ? Math.round(ritmoActualDia * diasAnio) : null

  const resultado = {
    anio, base, origenBase, porcentaje, meta, total,
    diasAnio, diasTranscurridos, diasRestantes,
    ritmoActualDia: redondear(ritmoActualDia),
    proyeccionCierre,
    metaSiguiente: proyeccionCierre ? Math.ceil(proyeccionCierre * (1 + porcentaje / 100)) : null,
  }
  if (!meta) return { ...resultado, avancePct: null, completada: false, faltan: null, enCamino: null, hitoAlcanzado: null, siguienteHito: null, faltanSiguienteHito: null, ritmoNecesarioDia: null, ritmoNecesarioSemana: null }

  const avancePct = redondear((total / meta) * 100)
  const completada = total >= meta
  const faltan = Math.max(0, meta - total)
  const hitoAlcanzado = [...HITOS].reverse().find(h => avancePct >= h.pct) ?? null
  const siguienteHito = HITOS.find(h => avancePct < h.pct) ?? null
  const ritmoNecesarioDia = !completada && diasRestantes > 0 ? redondear(faltan / diasRestantes) : null

  return {
    ...resultado, avancePct, completada, faltan,
    hitoAlcanzado, siguienteHito,
    faltanSiguienteHito: siguienteHito ? Math.max(0, Math.ceil((meta * siguienteHito.pct) / 100) - total) : null,
    ritmoNecesarioDia,
    ritmoNecesarioSemana: ritmoNecesarioDia === null ? null : redondear(ritmoNecesarioDia * 7),
    enCamino: completada ? true : proyeccionCierre === null ? null : proyeccionCierre >= meta,
  }
}
