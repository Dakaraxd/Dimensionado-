// Optimizador de cortes (guillotina): ubica piezas rectangulares en tableros.
//
// Todos los cortes son de lado a lado del espacio libre (guillotina), que es lo que
// una seccionadora puede ejecutar. Además de minimizar la cantidad de tableros, el
// resultado se elige para dejar el MAYOR RETAZO REUTILIZABLE posible: un solo
// rectángulo limpio, grande y lo más cuadrado que se pueda, sin "relieves".

// Espesor del corte de sierra (kerf) en cm: cada corte consume material
export const KERF = 0.4

// Dimensiones por defecto de un tablero en cm (editables al dimensionar)
export const PLANCHA_W_DEFAULT = 249
export const PLANCHA_H_DEFAULT = 182

const EPS = 1e-9
const r6 = v => Math.round(v * 1e6) / 1e6
const aspecto = (w, h) => (Math.max(w, h) > 0 ? Math.min(w, h) / Math.max(w, h) : 0)

// ───────────────────────── Retazo reutilizable ─────────────────────────

// Mayor rectángulo libre (sin ninguna pieza ni corte de sierra encima) de un tablero.
function mayorRectanguloLibre(cortes, W, H) {
  const rects = cortes.map(c => ({
    x1: r6(c.x), y1: r6(c.y),
    x2: r6(Math.min(W, c.x + c.w + KERF)), y2: r6(Math.min(H, c.y + c.h + KERF))
  }))
  const xs = [...new Set([0, r6(W), ...rects.flatMap(r => [r.x1, r.x2])])].sort((a, b) => a - b)
  const ys = [...new Set([0, r6(H), ...rects.flatMap(r => [r.y1, r.y2])])].sort((a, b) => a - b)
  const nx = xs.length - 1
  const ny = ys.length - 1
  const xi = new Map(xs.map((v, i) => [v, i]))
  const yi = new Map(ys.map((v, i) => [v, i]))

  const ocupado = Array.from({ length: ny }, () => new Uint8Array(nx))
  for (const r of rects) {
    for (let j = yi.get(r.y1); j < yi.get(r.y2); j++) {
      for (let i = xi.get(r.x1); i < xi.get(r.x2); i++) ocupado[j][i] = 1
    }
  }

  const alturas = new Float64Array(nx)
  let mejor = { area: 0, w: 0, h: 0 }
  for (let j = 0; j < ny; j++) {
    const dy = ys[j + 1] - ys[j]
    for (let i = 0; i < nx; i++) alturas[i] = ocupado[j][i] ? 0 : alturas[i] + dy

    const pila = []
    for (let i = 0; i <= nx; i++) {
      const h = i < nx ? alturas[i] : 0
      let inicio = i
      while (pila.length && pila[pila.length - 1].h > h) {
        const t = pila.pop()
        const w = xs[i] - xs[t.inicio]
        const area = w * t.h
        if (area > mejor.area + EPS || (Math.abs(area - mejor.area) <= EPS && aspecto(w, t.h) > aspecto(mejor.w, mejor.h))) {
          mejor = { area, w, h: t.h }
        }
        inicio = t.inicio
      }
      pila.push({ h, inicio })
    }
  }
  return mejor
}

// Analiza el retazo de cada tablero. `limpieza` = qué fracción del material libre
// forma un único rectángulo reutilizable (1 = todo el sobrante está junto).
export function analizarSobrante(planchas, W, H) {
  const porTablero = planchas.map((p, idx) => {
    const rect = mayorRectanguloLibre(p.cortes, W, H)
    const ocupadoArea = p.cortes.reduce(
      (s, c) => s + (Math.min(W, c.x + c.w + KERF) - c.x) * (Math.min(H, c.y + c.h + KERF) - c.y), 0)
    const libre = Math.max(W * H - ocupadoArea, EPS)
    return {
      tablero: idx + 1,
      w: rect.w,
      h: rect.h,
      area: rect.area,
      aspecto: aspecto(rect.w, rect.h),
      limpieza: Math.min(1, rect.area / libre)
    }
  })
  const mejor = porTablero.reduce((m, t) => (!m || t.area > m.area + EPS ? t : m), null)
  return { mejor, porTablero }
}

// Puntaje del retazo: área grande, forma cuadrada y sin fragmentos sueltos.
function puntajeSobrante(planchas, W, H) {
  const { mejor } = analizarSobrante(planchas, W, H)
  if (!mejor) return 0
  return 100 * (mejor.area / (W * H)) * (0.6 + 0.4 * mejor.aspecto) + 10 * mejor.limpieza
}

// ───────────────────────── Algoritmo clásico ─────────────────────────
// Se conserva tal cual como base de comparación: el motor nuevo nunca puede
// entregar un resultado con más tableros que este.

function mejorEspacioClasico(espacios, w, h) {
  let mejor = null
  for (const e of espacios) {
    if (e.w >= w && e.h >= h && (!mejor || e.w * e.h < mejor.w * mejor.h)) mejor = e
  }
  return mejor
}

function actualizarEspaciosClasico(espacios, espacio, w, h) {
  const idx = espacios.indexOf(espacio)
  espacios.splice(idx, 1)
  const wk = w + KERF
  const hk = h + KERF
  if (espacio.w - wk > 0) espacios.push({ x: espacio.x + wk, y: espacio.y, w: espacio.w - wk, h })
  if (espacio.h - hk > 0) espacios.push({ x: espacio.x, y: espacio.y + hk, w: espacio.w, h: espacio.h - hk })
  espacios.sort((a, b) => (a.y - b.y) || (a.x - b.x))
}

function intentarColocarClasico(plancha, corte, giro) {
  const espacio = mejorEspacioClasico(plancha.espacios, corte.largo, corte.ancho)
  if (espacio) {
    plancha.cortes.push({ ...corte, x: espacio.x, y: espacio.y, w: corte.largo, h: corte.ancho })
    actualizarEspaciosClasico(plancha.espacios, espacio, corte.largo, corte.ancho)
    return true
  }
  if (giro && corte.largo !== corte.ancho) {
    const espacioRot = mejorEspacioClasico(plancha.espacios, corte.ancho, corte.largo)
    if (espacioRot) {
      plancha.cortes.push({ ...corte, x: espacioRot.x, y: espacioRot.y, w: corte.ancho, h: corte.largo, rotado: true })
      actualizarEspaciosClasico(plancha.espacios, espacioRot, corte.ancho, corte.largo)
      return true
    }
  }
  return false
}

function guillotineClasico(ordenadas, W, H, giro) {
  const planchas = []
  const noColocadas = []
  for (const corte of ordenadas) {
    let colocado = false
    for (const plancha of planchas) {
      if (intentarColocarClasico(plancha, corte, giro)) { colocado = true; break }
    }
    if (!colocado) {
      const nueva = { id: planchas.length + 1, cortes: [], espacios: [{ x: 0, y: 0, w: W, h: H }] }
      if (intentarColocarClasico(nueva, corte, giro)) planchas.push(nueva)
      else noColocadas.push(corte)
    }
  }
  return { planchas, noColocadas }
}

function expandirPiezas(cortes) {
  const pendientes = []
  cortes.forEach((c, ci) => {
    for (let i = 0; i < c.cantidad; i++) pendientes.push({ ...c, key: `${ci}-${i}`, colorIdx: ci })
  })
  return pendientes
}

const area = p => p.largo * p.ancho
const ORDENES = [
  (a, b) => area(b) - area(a),
  (a, b) => b.largo - a.largo,
  (a, b) => b.ancho - a.ancho,
  (a, b) => (b.largo + b.ancho) - (a.largo + a.ancho),
  (a, b) => area(a) - area(b),
  (a, b) => (b.largo / b.ancho) - (a.largo / a.ancho),
]

// Resultado del algoritmo clásico (el mejor de sus 6 órdenes, con su criterio original)
export function calcularDistribucionClasica(cortes, W, H, { permitirGiro = true } = {}) {
  const pendientes = expandirPiezas(cortes)
  let mejor = null
  let mejorPuntaje = -Infinity
  for (const cmp of ORDENES) {
    const res = guillotineClasico([...pendientes].sort(cmp), W, H, permitirGiro)
    const totalTableros = res.planchas.length || 1
    const aprovechamiento = res.planchas.reduce(
      (sum, p) => sum + p.cortes.reduce((s, c) => s + c.w * c.h, 0) / (W * H), 0) / totalTableros
    const puntaje = (-res.noColocadas.length * 100000) + (-res.planchas.length * 1000) + (aprovechamiento * 100)
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = res }
  }
  return mejor
}

// ───────────────────────── Motor nuevo ─────────────────────────

function mulberry32(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const AJUSTES = ['BAF', 'BSSF', 'BLSF']
const REGLAS_DIVISION = ['H', 'V', 'SLAS', 'LLAS', 'MAXAS', 'MINAS']

function mejorOpcion(a, b) {
  if (Math.abs(a.s1 - b.s1) > EPS) return a.s1 < b.s1
  if (Math.abs(a.s2 - b.s2) > EPS) return a.s2 < b.s2
  // Desempate: pegar las piezas a la esquina superior izquierda para que el sobrante quede junto
  if (Math.abs(a.esp.y - b.esp.y) > EPS) return a.esp.y < b.esp.y
  if (Math.abs(a.esp.x - b.esp.x) > EPS) return a.esp.x < b.esp.x
  return !a.rot && b.rot
}

function dividir(espacios, esp, w, h, regla) {
  const wk = w + KERF
  const hk = h + KERF
  const sobraW = esp.w - w
  const sobraH = esp.h - h

  // H: la franja de abajo toma todo el ancho; la de la derecha solo el alto de la pieza
  const opcionH = [
    { x: esp.x + wk, y: esp.y, w: esp.w - wk, h },
    { x: esp.x, y: esp.y + hk, w: esp.w, h: esp.h - hk }
  ]
  // V: la franja de la derecha toma todo el alto; la de abajo solo el ancho de la pieza
  const opcionV = [
    { x: esp.x + wk, y: esp.y, w: esp.w - wk, h: esp.h },
    { x: esp.x, y: esp.y + hk, w, h: esp.h - hk }
  ]
  const mayorArea = op => Math.max(...op.map(r => (r.w > 0 && r.h > 0 ? r.w * r.h : 0)))

  let elegida
  if (regla === 'H') elegida = opcionH
  else if (regla === 'V') elegida = opcionV
  else if (regla === 'SLAS') elegida = sobraW <= sobraH ? opcionV : opcionH
  else if (regla === 'LLAS') elegida = sobraW <= sobraH ? opcionH : opcionV
  else if (regla === 'MAXAS') elegida = mayorArea(opcionH) >= mayorArea(opcionV) ? opcionH : opcionV
  else elegida = mayorArea(opcionH) <= mayorArea(opcionV) ? opcionH : opcionV

  const idx = espacios.indexOf(esp)
  espacios.splice(idx, 1)
  for (const r of elegida) if (r.w > 0.001 && r.h > 0.001) espacios.push(r)
  espacios.sort((a, b) => (a.y - b.y) || (a.x - b.x))
}

// Todas las formas posibles de ubicar una pieza en un tablero, de mejor a peor ajuste
function opcionesDe(plancha, pieza, ajuste, giro) {
  const opciones = []
  const orientaciones = giro && pieza.largo !== pieza.ancho ? [false, true] : [false]
  for (const esp of plancha.espacios) {
    for (const rot of orientaciones) {
      const w = rot ? pieza.ancho : pieza.largo
      const h = rot ? pieza.largo : pieza.ancho
      if (esp.w < w || esp.h < h) continue
      const sobraW = esp.w - w
      const sobraH = esp.h - h
      let s1, s2
      if (ajuste === 'BAF') { s1 = esp.w * esp.h - w * h; s2 = Math.min(sobraW, sobraH) }
      else if (ajuste === 'BSSF') { s1 = Math.min(sobraW, sobraH); s2 = Math.max(sobraW, sobraH) }
      else { s1 = Math.max(sobraW, sobraH); s2 = Math.min(sobraW, sobraH) }
      opciones.push({ esp, w, h, rot, s1, s2 })
    }
  }
  opciones.sort((a, b) => (mejorOpcion(a, b) ? -1 : mejorOpcion(b, a) ? 1 : 0))
  return opciones
}

function aplicarOpcion(plancha, pieza, op, regla) {
  plancha.cortes.push({ ...pieza, x: op.esp.x, y: op.esp.y, w: op.w, h: op.h, ...(op.rot ? { rotado: true } : {}) })
  dividir(plancha.espacios, op.esp, op.w, op.h, regla)
}

// `elegir(opciones)` decide cuál opción usar; `reglaDe()` qué forma de dividir el espacio
function empaquetar(piezas, W, H, { ajuste, giro, elegir, reglaDe }) {
  const planchas = []
  const noColocadas = []
  const colocarEn = (plancha, pieza) => {
    const opciones = opcionesDe(plancha, pieza, ajuste, giro)
    if (opciones.length === 0) return false
    aplicarOpcion(plancha, pieza, elegir(opciones), reglaDe())
    return true
  }
  for (const pieza of piezas) {
    let colocada = false
    for (const plancha of planchas) {
      if (colocarEn(plancha, pieza)) { colocada = true; break }
    }
    if (!colocada) {
      const nueva = { id: planchas.length + 1, cortes: [], espacios: [{ x: 0, y: 0, w: W, h: H }] }
      if (colocarEn(nueva, pieza)) planchas.push(nueva)
      else noColocadas.push(pieza)
    }
  }
  return { planchas, noColocadas }
}

// Entrega la distribución con menos tableros y, entre las que empatan, la que deja
// el mejor retazo reutilizable. Es determinista: mismos datos, mismo resultado.
export function calcularDistribucion(cortes, W, H, { permitirGiro = true } = {}) {
  const pendientes = expandirPiezas(cortes)
  const n = pendientes.length

  // Órdenes de colocación: los 6 clásicos + 2 por lado mayor/menor
  const ordenesExtra = [
    (a, b) => Math.max(b.largo, b.ancho) - Math.max(a.largo, a.ancho) || Math.min(b.largo, b.ancho) - Math.min(a.largo, a.ancho),
    (a, b) => Math.min(b.largo, b.ancho) - Math.min(a.largo, a.ancho) || Math.max(b.largo, b.ancho) - Math.max(a.largo, a.ancho),
  ]
  const listasBase = [...ORDENES, ...ordenesExtra].map(cmp => [...pendientes].sort(cmp))
  const azar = mulberry32(Math.round(W * 31 + H * 17 + n * 7 + pendientes.reduce((s, p) => s + p.largo * 3 + p.ancho, 0)))

  let mejorClave = null
  let mejorRes = null
  let mejorPuntaje = null
  const considerar = (res) => {
    const clave = [res.noColocadas.length, res.planchas.length]
    const mejora = !mejorClave || clave[0] < mejorClave[0] || (clave[0] === mejorClave[0] && clave[1] < mejorClave[1])
    if (mejora) {
      mejorClave = clave
      mejorRes = res
      mejorPuntaje = null
    } else if (clave[0] === mejorClave[0] && clave[1] === mejorClave[1]) {
      if (mejorPuntaje === null) mejorPuntaje = puntajeSobrante(mejorRes.planchas, W, H)
      const p = puntajeSobrante(res.planchas, W, H)
      if (p > mejorPuntaje + EPS) { mejorPuntaje = p; mejorRes = res }
    }
  }

  // 1) Clásicos: garantizan que nunca se use más tableros que antes
  for (const cmp of ORDENES) considerar(guillotineClasico([...pendientes].sort(cmp), W, H, permitirGiro))

  // 2) Reglas fijas (ajuste × forma de dividir) sobre cada orden
  const siempreLaMejor = ops => ops[0]
  for (const lista of listasBase) {
    for (const ajuste of AJUSTES) {
      for (const regla of REGLAS_DIVISION) {
        considerar(empaquetar(lista, W, H, { ajuste, giro: permitirGiro, elegir: siempreLaMejor, reglaDe: () => regla }))
      }
    }
  }

  // 3) Búsqueda diversificada: en cada pieza se elige al azar (reproducible) entre las
  //    mejores opciones, mezclando criterios. Así aparecen distribuciones, como girar una
  //    pieza para llenar un hueco, que ninguna regla fija genera por sí sola.
  const iteraciones = Math.max(200, Math.min(3000, Math.round(30000 / Math.max(n, 1))))
  const elegirAlAzar = ops => {
    const k = Math.min(ops.length, 3)
    const u = azar()
    const i = k === 1 ? 0 : k === 2 ? (u < 0.65 ? 0 : 1) : (u < 0.55 ? 0 : u < 0.85 ? 1 : 2)
    return ops[i]
  }
  const reglaAlAzar = () => REGLAS_DIVISION[Math.floor(azar() * REGLAS_DIVISION.length)]
  for (let it = 0; it < iteraciones; it++) {
    const base = listasBase[Math.floor(azar() * listasBase.length)]
    const lista = azar() < 0.5
      ? base
      : base.map(p => ({ p, v: azar() })).sort((a, b) => (area(b.p) * (0.7 + 0.6 * b.v)) - (area(a.p) * (0.7 + 0.6 * a.v))).map(o => o.p)
    considerar(empaquetar(lista, W, H, {
      ajuste: AJUSTES[Math.floor(azar() * AJUSTES.length)],
      giro: permitirGiro,
      elegir: elegirAlAzar,
      reglaDe: reglaAlAzar
    }))
  }

  return mejorRes
}
