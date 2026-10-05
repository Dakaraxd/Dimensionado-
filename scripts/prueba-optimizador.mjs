// Uso: node scripts/prueba-optimizador.mjs  (compara el optimizador nuevo contra el clásico)

const mod = await import(new URL('../src/lib/optimizador.js', import.meta.url).href)
const { calcularDistribucion, calcularDistribucionClasica, analizarSobrante, KERF } = mod

// ---- verificadores ----
function validar(res, cortes, W, H, giro) {
  const errores = []
  if (res.noColocadas.length) errores.push('hay piezas sin colocar')
  // piezas pedidas vs colocadas (comparando por dimensiones sin importar giro)
  const norm = (a, b) => [Math.min(a, b), Math.max(a, b)].join('x')
  const pedido = {}
  cortes.forEach(c => { pedido[norm(c.largo, c.ancho)] = (pedido[norm(c.largo, c.ancho)] || 0) + c.cantidad })
  const puesto = {}
  res.planchas.forEach(p => p.cortes.forEach(c => { puesto[norm(c.w, c.h)] = (puesto[norm(c.w, c.h)] || 0) + 1 }))
  if (JSON.stringify(Object.entries(pedido).sort()) !== JSON.stringify(Object.entries(puesto).sort())) errores.push('las piezas colocadas no coinciden con las pedidas')

  for (const p of res.planchas) {
    for (const c of p.cortes) {
      if (c.x < -1e-9 || c.y < -1e-9 || c.x + c.w > W + 1e-6 || c.y + c.h > H + 1e-6) errores.push('pieza fuera del tablero')
      if (!giro && c.rotado) errores.push('se giró una pieza con giro desactivado')
    }
    for (let i = 0; i < p.cortes.length; i++) {
      for (let j = i + 1; j < p.cortes.length; j++) {
        const a = p.cortes[i], b = p.cortes[j]
        const sepX = a.x + a.w + KERF <= b.x + 1e-6 || b.x + b.w + KERF <= a.x + 1e-6
        const sepY = a.y + a.h + KERF <= b.y + 1e-6 || b.y + b.h + KERF <= a.y + 1e-6
        if (!sepX && !sepY) errores.push('piezas superpuestas o sin espacio para la sierra')
      }
    }
    if (!esGuillotina(p.cortes.map(c => ({ x1: c.x, y1: c.y, x2: c.x + c.w, y2: c.y + c.h })))) errores.push('no se puede cortar con seccionadora (no es guillotina)')
  }
  return errores
}

// Un patrón es de guillotina si siempre existe un corte de lado a lado que separa las piezas
function esGuillotina(rs) {
  if (rs.length <= 1) return true
  const tol = 1e-6
  const xsCorte = [...new Set(rs.flatMap(r => [r.x2, r.x1]))]
  for (const x of xsCorte) {
    const izq = rs.filter(r => r.x2 <= x + tol)
    const der = rs.filter(r => r.x1 >= x - tol)
    if (izq.length && der.length && izq.length + der.length === rs.length && izq.length < rs.length) {
      if (esGuillotina(izq) && esGuillotina(der)) return true
    }
  }
  const ysCorte = [...new Set(rs.flatMap(r => [r.y2, r.y1]))]
  for (const y of ysCorte) {
    const arr = rs.filter(r => r.y2 <= y + tol)
    const aba = rs.filter(r => r.y1 >= y - tol)
    if (arr.length && aba.length && arr.length + aba.length === rs.length && arr.length < rs.length) {
      if (esGuillotina(arr) && esGuillotina(aba)) return true
    }
  }
  return false
}

const fmt = n => n.toFixed(1)
function resumen(res, W, H) {
  const s = analizarSobrante(res.planchas, W, H)
  return `tableros=${res.planchas.length} retazo=${fmt(s.mejor.w)}x${fmt(s.mejor.h)} (area ${(100 * s.mejor.area / (W * H)).toFixed(0)}%, aspecto ${s.mejor.aspecto.toFixed(2)}, limpieza ${s.mejor.limpieza.toFixed(2)})`
}

// ---- 1) El caso de la foto ----
const W = 249, H = 182
const foto = [{ largo: 100, ancho: 50, cantidad: 2, nombre: 'P' }, { largo: 10, ancho: 30, cantidad: 5, nombre: 'S' }]
const viejo = calcularDistribucionClasica(foto, W, H)
const nuevo = calcularDistribucion(foto, W, H)
console.log('FOTO  clasico:', resumen(viejo, W, H))
console.log('FOTO  nuevo  :', resumen(nuevo, W, H))
console.log('      errores nuevo:', validar(nuevo, foto, W, H, true))
console.log('      layout nuevo :', nuevo.planchas[0].cortes.map(c => `${c.w}x${c.h}@(${fmt(c.x)},${fmt(c.y)})${c.rotado ? 'R' : ''}`).join('  '))

// ---- 2) Casos aleatorios ----
let semilla = 12345
const rnd = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296 }
let peoresTableros = 0, mejoresTableros = 0, mejoresRetazo = 0, peoresRetazo = 0, invalidos = 0
let sumaViejo = 0, sumaNuevo = 0, maxMs = 0
const N = 300
for (let t = 0; t < N; t++) {
  const tipos = 1 + Math.floor(rnd() * 5)
  const cortes = Array.from({ length: tipos }, () => ({
    largo: 5 + Math.floor(rnd() * 120), ancho: 5 + Math.floor(rnd() * 90),
    cantidad: 1 + Math.floor(rnd() * 8), nombre: 'p'
  }))
  const giro = rnd() > 0.2
  const v = calcularDistribucionClasica(cortes, W, H, { permitirGiro: giro })
  const t0 = performance.now()
  const n = calcularDistribucion(cortes, W, H, { permitirGiro: giro })
  maxMs = Math.max(maxMs, performance.now() - t0)
  if (v.noColocadas.length) continue // caso imposible para ambos (pieza que no cabe)
  const err = validar(n, cortes, W, H, giro)
  if (err.length) { invalidos++; if (invalidos <= 3) console.log('INVALIDO', JSON.stringify(cortes), err) }
  if (n.planchas.length > v.planchas.length) peoresTableros++
  if (n.planchas.length < v.planchas.length) mejoresTableros++
  if (n.planchas.length === v.planchas.length) {
    const rv = analizarSobrante(v.planchas, W, H).mejor, rn = analizarSobrante(n.planchas, W, H).mejor
    sumaViejo += rv.area / (W * H); sumaNuevo += rn.area / (W * H)
    if (rn.area > rv.area + 1) mejoresRetazo++
    if (rn.area < rv.area - 1) peoresRetazo++
  }
}
console.log(`\nALEATORIOS (${N}): inválidos=${invalidos}  más tableros que antes=${peoresTableros}  menos tableros=${mejoresTableros}`)
console.log(`  con igual n° de tableros: retazo mayor=${mejoresRetazo}  retazo menor=${peoresRetazo}`)
console.log(`  retazo promedio (como % del tablero): antes ${(100 * sumaViejo / N).toFixed(1)}%  ahora ${(100 * sumaNuevo / N).toFixed(1)}%`)
console.log(`  tiempo máximo de cálculo: ${maxMs.toFixed(0)} ms`)

// ---- 3) Caso grande (rendimiento) ----
const grande = Array.from({ length: 12 }, (_, i) => ({ largo: 20 + i * 9, ancho: 15 + i * 6, cantidad: 12, nombre: 'g' }))
const t1 = performance.now()
const rg = calcularDistribucion(grande, W, H)
console.log(`\nGRANDE (144 piezas): ${resumen(rg, W, H)}  en ${(performance.now() - t1).toFixed(0)} ms  errores=${validar(rg, grande, W, H, true).length}`)
