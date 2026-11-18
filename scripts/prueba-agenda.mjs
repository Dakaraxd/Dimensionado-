// Pruebas del día sugerido al agendar (antes / después de las 12:00) y del borrador de la orden.
import { diaSugerido } from '../src/lib/agenda.js'

let ok = 0, mal = 0
const prueba = (n, c) => { if (c) { ok++; console.log('  ✓', n) } else { mal++; console.log('  ✗ FALLÓ:', n) } }

const dia = (fecha, cupo) => ({ fecha, cupo_disponible: cupo })
const dias = [dia('2026-11-18', 5), dia('2026-11-19', 5), dia('2026-11-20', 5)]
const hoy = '2026-11-18'

prueba('11:59 → hoy', diaSugerido(dias, 2, hoy, 11) === '2026-11-18')
prueba('00:00 → hoy', diaSugerido(dias, 2, hoy, 0) === '2026-11-18')
prueba('12:00 → mañana', diaSugerido(dias, 2, hoy, 12) === '2026-11-19')
prueba('15:00 → mañana', diaSugerido(dias, 2, hoy, 15) === '2026-11-19')
prueba('23:00 → mañana', diaSugerido(dias, 2, hoy, 23) === '2026-11-19')
prueba('tarde y mañana sin cupo → el siguiente con cupo', diaSugerido([dia(hoy, 5), dia('2026-11-19', 0), dia('2026-11-20', 3)], 2, hoy, 15) === '2026-11-20')
prueba('tarde y mañana no alcanza para los tableros → el siguiente que alcanza', diaSugerido([dia(hoy, 5), dia('2026-11-19', 1), dia('2026-11-20', 4)], 3, hoy, 15) === '2026-11-20')
prueba('tarde y nada después de hoy → hoy (se puede elegir igual)', diaSugerido([dia(hoy, 5)], 2, hoy, 15) === hoy)
prueba('tarde, después de hoy sin cupo → hoy', diaSugerido([dia(hoy, 5), dia('2026-11-19', 0)], 2, hoy, 15) === hoy)
prueba('mañana sin día de hoy planificado, antes de las 12 → el primer día con cupo', diaSugerido([dia('2026-11-19', 5)], 2, hoy, 9) === '2026-11-19')
prueba('hoy sin cupo, antes de las 12 → el siguiente con cupo', diaSugerido([dia(hoy, 0), dia('2026-11-19', 5)], 2, hoy, 9) === '2026-11-19')
prueba('sin ningún cupo → null', diaSugerido([dia(hoy, 0), dia('2026-11-19', 1)], 2, hoy, 9) === null)
prueba('sin días → null', diaSugerido([], 2, hoy, 9) === null && diaSugerido(undefined, 2, hoy, 9) === null)
prueba('cruce de mes: 15:00 del 30 → 1 del mes siguiente', diaSugerido([dia('2026-11-30', 5), dia('2026-12-01', 5)], 1, '2026-11-30', 15) === '2026-12-01')

console.log(`\nResultado: ${ok} correctas, ${mal} fallidas`)
process.exit(mal ? 1 : 0)
