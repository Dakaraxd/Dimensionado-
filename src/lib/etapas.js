// Etapas de corte de un tablero: cuántas veces hay que cambiar de dirección (girar el material en la
// seccionadora) para sacar todas las piezas.
//   Etapa 1 = cortes paralelos de lado a lado del tablero; etapa 2 = cortes cruzados sobre cada tira;
//   etapa 3 = cortes paralelos a los de la primera sobre cada columna; y así.
// También cuentan los cortes que separan un sobrante (merma) de una pieza.
// Sirve igual para distribuciones antiguas ya guardadas: solo mira dónde quedó cada pieza.

import { KERF } from './optimizador.js'

const TOL = 1e-6

function analizar(cortes, W, H, preferida) {
  const rs = cortes.map(c => ({ x1: c.x, y1: c.y, x2: c.x + c.w, y2: c.y + c.h }))
  const porEtapa = []
  let total = 0
  let cruzanTodo = 0

  function cortar(etapa, caja, dir) {
    total++
    porEtapa[etapa] = (porEtapa[etapa] ?? 0) + 1
    if (dir === 'V' ? (caja.y2 - caja.y1) >= H - TOL : (caja.x2 - caja.x1) >= W - TOL) cruzanTodo++
  }

  // Devuelve la etapa más alta que se necesita dentro de `caja`, o Infinity si no se puede cortar de lado a lado
  function resolver(lista, caja, dirPadre, etapaPadre) {
    if (lista.length === 0) return 0

    if (lista.length === 1) {
      // Una sola pieza: solo faltan los recortes del sobrante que la rodea (una holgura de KERF es el ancho de la sierra)
      const r = lista[0]
      const recortes = []
      if (caja.x2 - r.x2 > KERF + TOL || r.x1 - caja.x1 > KERF + TOL) recortes.push('V')
      if (caja.y2 - r.y2 > KERF + TOL || r.y1 - caja.y1 > KERF + TOL) recortes.push('H')
      recortes.sort((a, b) => (a === dirPadre ? -1 : 0) - (b === dirPadre ? -1 : 0))
      let etapa = etapaPadre
      let dir = dirPadre
      let max = etapaPadre
      for (const d of recortes) {
        if (d !== dir) { etapa += dir === null ? 1 : 1; dir = d }
        cortar(etapa, caja, d)
        max = Math.max(max, etapa)
      }
      return max
    }

    const candidatos = []
    for (const x of new Set(lista.flatMap(r => [r.x2, r.x1]))) {
      const a = lista.filter(r => r.x2 <= x + TOL)
      const b = lista.filter(r => r.x1 >= x - TOL)
      if (a.length && b.length && a.length + b.length === lista.length) candidatos.push({ d: 'V', p: x, a, b })
    }
    for (const y of new Set(lista.flatMap(r => [r.y2, r.y1]))) {
      const a = lista.filter(r => r.y2 <= y + TOL)
      const b = lista.filter(r => r.y1 >= y - TOL)
      if (a.length && b.length && a.length + b.length === lista.length) candidatos.push({ d: 'H', p: y, a, b })
    }
    // cortes que quitan un sobrante (sin piezas al otro lado)
    const minX = Math.min(...lista.map(r => r.x1)), maxX = Math.max(...lista.map(r => r.x2))
    const minY = Math.min(...lista.map(r => r.y1)), maxY = Math.max(...lista.map(r => r.y2))
    if (caja.x2 - maxX > KERF + TOL) candidatos.push({ d: 'V', p: maxX, a: lista, b: [] })
    if (minX - caja.x1 > KERF + TOL) candidatos.push({ d: 'V', p: minX, a: [], b: lista })
    if (caja.y2 - maxY > KERF + TOL) candidatos.push({ d: 'H', p: maxY, a: lista, b: [] })
    if (minY - caja.y1 > KERF + TOL) candidatos.push({ d: 'H', p: minY, a: [], b: lista })
    if (!candidatos.length) return Infinity

    // Se prefiere seguir en la misma dirección que el corte anterior (misma etapa); en la raíz, la dirección `preferida`
    const t = candidatos.find(c => c.d === (dirPadre ?? preferida)) ?? candidatos[0]
    const etapa = dirPadre === null ? 1 : (t.d === dirPadre ? etapaPadre : etapaPadre + 1)
    cortar(etapa, caja, t.d)
    const cA = t.d === 'V' ? { ...caja, x2: t.p } : { ...caja, y2: t.p }
    const cB = t.d === 'V' ? { ...caja, x1: t.p } : { ...caja, y1: t.p }
    return Math.max(etapa, resolver(t.a, cA, t.d, etapa), resolver(t.b, cB, t.d, etapa))
  }

  const etapas = resolver(rs, { x1: 0, y1: 0, x2: W, y2: H }, null, 0)
  if (!Number.isFinite(etapas)) return { valido: false, etapas: Infinity, cortes: 0, cruzanTodo: 0, porEtapa: [] }
  return { valido: true, etapas, cortes: total, cruzanTodo, porEtapa: porEtapa.map(n => n ?? 0) }
}

// Analiza un tablero (la lista de piezas con x, y, w, h) probando empezar por tiras horizontales y por verticales
export function etapasDeCorte(cortes, W, H) {
  const a = analizar(cortes, W, H, 'H')
  const b = analizar(cortes, W, H, 'V')
  if (!a.valido) return b
  if (!b.valido) return a
  return a.etapas < b.etapas || (a.etapas === b.etapas && a.cortes <= b.cortes) ? a : b
}
