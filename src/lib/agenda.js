// Día que la app deja marcado de entrada al agendar cortes.
//  - Antes de las 12:00 (hora de Chile): el primer día con cupo, normalmente hoy.
//  - Desde las 12:00: el primer día con cupo DESPUÉS de hoy. Hoy sigue disponible para elegirlo a mano.
//  - Si después de hoy no hay ningún día con cupo, vale el primero que haya (aunque sea hoy).
export const HORA_CORTE_DEL_DIA = 12

export function diaSugerido(dias, tableros, hoy, hora) {
  const conCupo = (dias ?? []).filter(d => d.cupo_disponible >= tableros)
  if (conCupo.length === 0) return null
  if (hora >= HORA_CORTE_DEL_DIA) {
    const siguiente = conCupo.find(d => d.fecha > hoy)
    if (siguiente) return siguiente.fecha
  }
  return conCupo[0].fecha
}
