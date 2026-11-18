// Uso: node scripts/prueba-tiras.mjs
// Comprueba el modo de cortes ORDENADOS (en tiras, máximo 3 etapas) contra la distribución general:
// validez, orden, cantidad de tableros, determinismo y casos de borde.

const mod = await import(new URL('../src/lib/optimizador.js', import.meta.url).href)
const { etapasDeCorte } = await import(new URL('../src/lib/etapas.js', import.meta.url).href)
const { calcularDistribucion, analizarSobrante, KERF } = mod

const W = 249, H = 182
let ok = 0, mal = 0
const prueba = (nombre, cond, extra = '') => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗ FALLÓ:', nombre, extra) } }

// ---- verificadores ----
function errores(res, cortes, Wt, Ht, giro) {
  const e = new Set()
  if (res.noColocadas.length) e.add('piezas sin colocar')
  const norm = (a, b) => [Math.min(a, b), Math.max(a, b)].join('x')
  const pedido = {}
  cortes.forEach(c => { pedido[norm(c.largo, c.ancho)] = (pedido[norm(c.largo, c.ancho)] || 0) + c.cantidad })
  const puesto = {}
  res.planchas.forEach(p => p.cortes.forEach(c => { puesto[norm(c.w, c.h)] = (puesto[norm(c.w, c.h)] || 0) + 1 }))
  if (JSON.stringify(Object.entries(pedido).sort()) !== JSON.stringify(Object.entries(puesto).sort())) e.add('las piezas colocadas no coinciden con las pedidas')
  for (const p of res.planchas) {
    for (const c of p.cortes) {
      if (c.x < -1e-9 || c.y < -1e-9 || c.x + c.w > Wt + 1e-6 || c.y + c.h > Ht + 1e-6) e.add('pieza fuera del tablero')
      if (!giro && c.rotado) e.add('se giró una pieza con el giro desactivado')
      const sinGiro = Math.abs(c.w - c.largo) < 1e-9 && Math.abs(c.h - c.ancho) < 1e-9
      const girada = Math.abs(c.w - c.ancho) < 1e-9 && Math.abs(c.h - c.largo) < 1e-9
      if (!sinGiro && !girada) e.add('las medidas de la pieza no corresponden a las pedidas')
      if (!!c.rotado !== (!sinGiro && girada)) e.add('la marca de giro no coincide con las medidas')
    }
    for (let i = 0; i < p.cortes.length; i++) {
      for (let j = i + 1; j < p.cortes.length; j++) {
        const a = p.cortes[i], b = p.cortes[j]
        const sepX = a.x + a.w + KERF <= b.x + 1e-6 || b.x + b.w + KERF <= a.x + 1e-6
        const sepY = a.y + a.h + KERF <= b.y + 1e-6 || b.y + b.h + KERF <= a.y + 1e-6
        if (!sepX && !sepY) e.add('piezas superpuestas o sin espacio para la sierra')
      }
    }
    if (!etapasDeCorte(p.cortes, Wt, Ht).valido) e.add('no se puede cortar de lado a lado (no es guillotina)')
  }
  return [...e]
}

let semilla = 20261118
const rnd = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296 }
const ent = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const generar = () => {
  const cortes = []
  const tipos = ent(1, 7)
  for (let i = 0; i < tipos; i++) {
    let l = ent(10, 140), a = ent(10, 140)
    if (Math.max(l, a) < 30) l = ent(30, 120) // medida mínima de seguridad 10 × 30
    cortes.push({ largo: l, ancho: a, cantidad: ent(1, 10), nombre: '' })
  }
  return cortes
}

// ---- 1) El caso del cliente: 2 piezas grandes y muchas pequeñas ----
console.log('\nCaso del cliente (2×130×70 + varias de 20×15)')
for (const n of [10, 15, 17, 20, 25]) {
  const cortes = [{ largo: 130, ancho: 70, cantidad: 2, nombre: '' }, { largo: 20, ancho: 15, cantidad: n, nombre: '' }]
  const r = calcularDistribucion(cortes, W, H)
  const g = calcularDistribucion(cortes, W, H, { ordenado: false })
  const et = r.planchas.map(p => etapasDeCorte(p.cortes, W, H))
  prueba(`${n} pequeñas: modo ordenado, ${r.planchas.length} tablero (el general usa ${g.planchas.length})`, r.modo === 'ordenado' && r.planchas.length <= g.planchas.length)
  prueba(`${n} pequeñas: como máximo 3 etapas (hay ${et.map(e => e.etapas).join(', ')})`, et.every(e => e.etapas <= 3))
  prueba(`${n} pequeñas: sin errores`, errores(r, cortes, W, H, true).length === 0, JSON.stringify(errores(r, cortes, W, H, true)))
}

// ---- 2) Casos aleatorios ----
console.log('\nCasos aleatorios')
const N = 400
let invalidos = 0, ordenados = 0, generales = 0, masQueGeneral = 0, noOrdenadoCon3 = 0, noDeterminista = 0, maxMs = 0, sumaMs = 0
let etapasMax = 0, totalTableros = 0, totalTablerosGen = 0
let sinGiroMal = 0
for (let k = 0; k < N; k++) {
  const cortes = generar()
  const giro = rnd() < 0.7
  const t0 = performance.now()
  const r = calcularDistribucion(cortes, W, H, { permitirGiro: giro })
  const ms = performance.now() - t0
  sumaMs += ms; maxMs = Math.max(maxMs, ms)
  const g = calcularDistribucion(cortes, W, H, { permitirGiro: giro, ordenado: false })
  if (errores(r, cortes, W, H, giro).length) { invalidos++; console.log('   INVÁLIDO', JSON.stringify(cortes), errores(r, cortes, W, H, giro)) }
  if (r.planchas.length > g.planchas.length) masQueGeneral++
  totalTableros += r.planchas.length; totalTablerosGen += g.planchas.length
  if (r.modo === 'ordenado') {
    ordenados++
    for (const p of r.planchas) { const e = etapasDeCorte(p.cortes, W, H).etapas; etapasMax = Math.max(etapasMax, e); if (e > 3) noOrdenadoCon3++ }
  } else generales++
  if (!giro && r.planchas.some(p => p.cortes.some(c => c.rotado))) sinGiroMal++
  if (k % 25 === 0) { // determinismo
    const otra = calcularDistribucion(cortes, W, H, { permitirGiro: giro })
    if (JSON.stringify(otra.planchas) !== JSON.stringify(r.planchas)) noDeterminista++
  }
}
prueba(`${N} trabajos: ningún resultado inválido`, invalidos === 0)
prueba('nunca usa más tableros que la distribución general', masQueGeneral === 0, `${masQueGeneral} casos`)
prueba(`todo resultado "ordenado" tiene como máximo 3 etapas por tablero (máx. visto ${etapasMax})`, noOrdenadoCon3 === 0)
prueba('con el giro desactivado nunca gira una pieza', sinGiroMal === 0)
prueba('es determinista (mismos datos, mismo resultado)', noDeterminista === 0)
console.log(`   · modo ordenado en ${ordenados} de ${N} (${(100 * ordenados / N).toFixed(1)}%); general en ${generales}`)
console.log(`   · tableros totales: ordenado/mixto ${totalTableros} · general ${totalTablerosGen}`)
console.log(`   · tiempo: medio ${(sumaMs / N).toFixed(0)} ms, máximo ${maxMs.toFixed(0)} ms`)
prueba('el modo ordenado se usa en la gran mayoría de los trabajos (≥ 93 %)', ordenados / N >= 0.93)
prueba('el tiempo máximo es razonable (< 2,5 s)', maxMs < 2500, `${maxMs.toFixed(0)} ms`)

// ---- 3) Casos de borde ----
console.log('\nCasos de borde')
let c = [{ largo: 249, ancho: 182, cantidad: 1, nombre: '' }]
let r = calcularDistribucion(c, W, H)
prueba('una pieza del tamaño exacto del tablero', r.planchas.length === 1 && r.noColocadas.length === 0 && errores(r, c, W, H, true).length === 0)
c = [{ largo: 249, ancho: 182, cantidad: 3, nombre: '' }]
r = calcularDistribucion(c, W, H)
prueba('3 piezas del tamaño del tablero = 3 tableros', r.planchas.length === 3 && errores(r, c, W, H, true).length === 0)
c = [{ largo: 60, ancho: 60, cantidad: 12, nombre: '' }]
r = calcularDistribucion(c, W, H)
prueba('piezas cuadradas (12 de 60×60)', errores(r, c, W, H, true).length === 0 && r.planchas.every(p => etapasDeCorte(p.cortes, W, H).etapas <= 3))
c = [{ largo: 300, ancho: 20, cantidad: 1, nombre: '' }]
r = calcularDistribucion(c, W, H)
prueba('una pieza que no cabe en el tablero queda sin colocar (sin romperse)', r.noColocadas.length === 1)
c = [{ largo: 100, ancho: 50, cantidad: 2, nombre: '' }, { largo: 400, ancho: 30, cantidad: 1, nombre: '' }]
r = calcularDistribucion(c, W, H)
prueba('mezcla de piezas que caben y una que no: las que caben se colocan', r.noColocadas.length === 1 && r.planchas.reduce((s, p) => s + p.cortes.length, 0) === 2)
c = [{ largo: 249, ancho: 20, cantidad: 8, nombre: '' }]
r = calcularDistribucion(c, W, H)
prueba('8 tiras largas de 249×20 (justo el largo del tablero) caben en 1 tablero', errores(r, c, W, H, true).length === 0 && r.planchas.length === 1, `tableros ${r.planchas.length}`)
c = [{ largo: 249, ancho: 20, cantidad: 9, nombre: '' }]
r = calcularDistribucion(c, W, H)
prueba('la 9.ª tira ya no cabe (9×20 + 8 sierras = 183,2 cm > 182): 2 tableros', errores(r, c, W, H, true).length === 0 && r.planchas.length === 2, `tableros ${r.planchas.length}`)
c = [{ largo: 20, ancho: 249, cantidad: 9, nombre: '' }]
r = calcularDistribucion(c, W, H, { permitirGiro: false })
prueba('tiras de 20×249 sin poder girar (no caben de lado: 249 > 182)', r.noColocadas.length === 9)
c = [{ largo: 30, ancho: 10, cantidad: 60, nombre: '' }]
r = calcularDistribucion(c, W, H)
prueba('60 piezas pequeñas de 30×10 (medida mínima)', errores(r, c, W, H, true).length === 0 && r.planchas.every(p => etapasDeCorte(p.cortes, W, H).etapas <= 3))
const colorDistinto = [{ largo: 50, ancho: 40, cantidad: 3, nombre: 'a' }, { largo: 50, ancho: 40, cantidad: 3, nombre: 'b' }]
r = calcularDistribucion(colorDistinto, W, H)
const colores = new Set(r.planchas.flatMap(p => p.cortes.map(x => x.colorIdx)))
prueba('dos filas con la misma medida conservan su color y su nombre', colores.size === 2 && r.planchas.flatMap(p => p.cortes).filter(x => x.nombre === 'a').length === 3)
r = calcularDistribucion([], W, H)
prueba('sin piezas no se rompe', r.planchas.length === 0 && r.noColocadas.length === 0)

// ---- 4) Un trabajo grande ----
const grande = [{ largo: 70, ancho: 45, cantidad: 40, nombre: '' }, { largo: 35, ancho: 22, cantidad: 60, nombre: '' }, { largo: 120, ancho: 60, cantidad: 12, nombre: '' }, { largo: 90, ancho: 30, cantidad: 30, nombre: '' }]
const t1 = performance.now()
r = calcularDistribucion(grande, W, H)
const msG = performance.now() - t1
prueba(`trabajo grande (142 piezas): válido, ≤ 3 etapas, ${r.planchas.length} tableros, ${msG.toFixed(0)} ms`, errores(r, grande, W, H, true).length === 0 && r.planchas.every(p => etapasDeCorte(p.cortes, W, H).etapas <= 3) && msG < 3000)

// ---- 5) La opción de desactivar el orden ----
const cc = [{ largo: 130, ancho: 70, cantidad: 2, nombre: '' }, { largo: 20, ancho: 15, cantidad: 17, nombre: '' }]
const libre = calcularDistribucion(cc, W, H, { ordenado: false })
const orden = calcularDistribucion(cc, W, H)
prueba('con ordenado=false se usa la distribución general', libre.modo === 'general' && !libre.ordenadoNoPosible)
const eLibre = libre.planchas.map(p => etapasDeCorte(p.cortes, W, H).etapas)
const eOrden = orden.planchas.map(p => etapasDeCorte(p.cortes, W, H).etapas)
console.log(`   · etapas: general ${eLibre.join(',')} · ordenado ${eOrden.join(',')}`)
const retL = analizarSobrante(libre.planchas, W, H).mejor, retO = analizarSobrante(orden.planchas, W, H).mejor
console.log(`   · mayor retazo: general ${retL.w.toFixed(0)}×${retL.h.toFixed(0)} · ordenado ${retO.w.toFixed(0)}×${retO.h.toFixed(0)}`)

console.log(`\nResultado: ${ok} correctas, ${mal} fallidas`)
process.exit(mal ? 1 : 0)
