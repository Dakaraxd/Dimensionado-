// Borrador de la orden en curso: guarda el avance para no perderlo al cambiar de pestaña o recargar.
//  - Es por usuario y vale solo para el día de hoy (las órdenes sin pagar se cancelan a medianoche).
//  - Queda en este equipo; se borra al cerrar sesión y al terminar o descartar la orden.
import { hoyChile } from './fechas.js'

const PREFIJO = 'dimensionado.borrador.venta.'
const clave = (usuarioId) => PREFIJO + usuarioId

export function leerBorrador(usuarioId) {
  if (!usuarioId) return null
  try {
    const crudo = localStorage.getItem(clave(usuarioId))
    if (!crudo) return null
    const b = JSON.parse(crudo)
    if (!b || b.dia !== hoyChile() || typeof b.datos !== 'object' || b.datos === null) {
      localStorage.removeItem(clave(usuarioId))
      return null
    }
    return b.datos
  } catch {
    return null
  }
}

export function guardarBorrador(usuarioId, datos) {
  if (!usuarioId) return
  try { localStorage.setItem(clave(usuarioId), JSON.stringify({ dia: hoyChile(), datos })) } catch { /* sin espacio o bloqueado: no pasa nada */ }
}

export function borrarBorrador(usuarioId) {
  if (!usuarioId) return
  try { localStorage.removeItem(clave(usuarioId)) } catch { /* nada */ }
}

// Al cerrar sesión no debe quedar el avance de nadie en el equipo
export function borrarTodosLosBorradores() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIJO)) localStorage.removeItem(k)
  } catch { /* nada */ }
}
