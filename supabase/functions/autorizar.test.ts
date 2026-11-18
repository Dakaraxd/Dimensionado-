import { assert, assertEquals } from 'jsr:@std/assert@1'
import { manejar } from './autorizar-stock/handler.ts'

const ADMIN = '11111111-1111-1111-1111-111111111111'
const VEND = '22222222-2222-2222-2222-222222222222'
const SUB1 = '33333333-3333-3333-3333-333333333333'
const SUB2 = '44444444-4444-4444-4444-444444444444'
const SUB_INACTIVO = '55555555-5555-5555-5555-555555555555'
const PLANCHA = '66666666-6666-6666-6666-666666666666'

// Base simulada en memoria con la forma mínima de la API de Supabase que usa la función
function crearAdmin(errorInsert: { message: string } | null = null) {
  const tablas: Record<string, Record<string, unknown>[]> = {
    profiles: [
      { id: ADMIN, nombre: 'Ana', rol: 'administrador', activo: true },
      { id: VEND, nombre: 'Beto', rol: 'vendedor', activo: true },
      { id: SUB1, nombre: 'Sub Uno', rol: 'subgerente', activo: true },
      { id: SUB2, nombre: 'Sub Dos', rol: 'subgerente', activo: true },
      { id: SUB_INACTIVO, nombre: 'Sub Baja', rol: 'subgerente', activo: false },
    ],
    clave_subgerente: [],
    tipos_plancha: [{ id: PLANCHA, nombre: 'Blanca', medida: '18mm' }],
    movimientos_inventario: [],
    logs: [],
  }
  function constructor(tabla: string) {
    let filas = [...(tablas[tabla] ?? [])]
    let op: 'select' | 'update' | 'delete' = 'select'
    let cambios: Record<string, unknown> = {}
    const b = {
      select() { return b },
      eq(col: string, v: unknown) { filas = filas.filter(f => f[col] === v); return b },
      update(c: Record<string, unknown>) { op = 'update'; cambios = c; return b },
      delete() { op = 'delete'; return b },
      insert(c: Record<string, unknown>) {
        if (tabla === 'movimientos_inventario' && errorInsert) return Promise.resolve({ data: null, error: errorInsert })
        tablas[tabla].push({ ...c })
        return Promise.resolve({ data: null, error: null })
      },
      upsert(c: Record<string, unknown>, o: { onConflict: string }) {
        const f = tablas[tabla].find(x => x[o.onConflict] === c[o.onConflict])
        if (f) Object.assign(f, c); else tablas[tabla].push({ ...c })
        return Promise.resolve({ data: null, error: null })
      },
      maybeSingle() { return Promise.resolve({ data: filas[0] ?? null, error: null }) },
      then(ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
        let res: unknown
        if (op === 'update') { filas.forEach(f => Object.assign(f, cambios)); res = { data: null, error: null } }
        else if (op === 'delete') { tablas[tabla] = tablas[tabla].filter(f => !filas.includes(f)); res = { data: null, error: null } }
        else res = { data: filas, error: null }
        return Promise.resolve(res).then(ok, fail)
      },
    }
    return b
  }
  return { admin: { from: constructor }, tablas }
}

const post = (cuerpo: unknown) => new Request('http://x/', { method: 'POST', body: JSON.stringify(cuerpo) })
const llamar = async (admin: unknown, usuario: string, cuerpo: unknown, ahora?: Date) => {
  const r = await manejar(post(cuerpo), admin, usuario, ahora)
  return { status: r.status, ...(await r.json()) }
}
const definir = (admin: unknown, sub: string, clave: string, clave_actual?: string) =>
  llamar(admin, sub, { accion: 'definir', clave, clave_actual })
const mov = (admin: unknown, sub: string, clave: string, extra: Record<string, unknown> = {}, quien = ADMIN, ahora?: Date) =>
  llamar(admin, quien, { accion: 'movimiento', subgerente_id: sub, clave, tipo_plancha_id: PLANCHA, tipo: 'ajuste', cantidad: 10, motivo: 'conteo físico', ...extra }, ahora)

Deno.test('Definir clave: solo subgerentes, exactamente 6 números no evidentes, y se guarda solo el hash', async () => {
  const { admin, tablas } = crearAdmin()
  assertEquals((await definir(admin, ADMIN, '482916')).status, 403)
  assertEquals((await definir(admin, VEND, '482916')).status, 403)
  for (const mala of ['corta', '48291', '4829166', 'abcdef', '48a916', '482 916', '000000', '111111', '123456', '654321', '']) {
    assertEquals((await definir(admin, SUB1, mala)).status, 400, mala)
  }
  assertEquals(tablas.clave_subgerente.length, 0)
  assertEquals((await definir(admin, SUB1, '482916')).status, 200)
  assert(!JSON.stringify(tablas.clave_subgerente).includes('482916'))
  assertEquals(tablas.clave_subgerente.length, 1)
})

Deno.test('Cambiar la clave exige la clave actual', async () => {
  const { admin } = crearAdmin()
  await definir(admin, SUB1, '482916')
  assertEquals((await definir(admin, SUB1, '715304')).codigo, 'clave_actual_requerida')
  assertEquals((await definir(admin, SUB1, '715304', 'mala-mala')).status, 401)
  assertEquals((await definir(admin, SUB1, '715304', '482916')).status, 200)
  assertEquals((await mov(admin, SUB1, '715304')).status, 200)
  assertEquals((await mov(admin, SUB1, '482916')).status, 401)
})

Deno.test('Lista: administrador y vendedor; únicamente subgerentes activos que ya tienen clave', async () => {
  const { admin } = crearAdmin()
  await definir(admin, SUB1, '482916')
  assertEquals((await llamar(admin, SUB1, { accion: 'lista' })).status, 403)
  for (const quien of [ADMIN, VEND]) {
    const r = await llamar(admin, quien, { accion: 'lista' })
    assertEquals(r.subgerentes, [{ id: SUB1, nombre: 'Sub Uno' }]) // Sub Dos sin clave, Sub Baja inactivo
  }
})

Deno.test('Movimiento con la clave correcta: se registra con quién lo hizo y quién autorizó', async () => {
  const { admin, tablas } = crearAdmin()
  await definir(admin, SUB1, '482916')
  const r = await mov(admin, SUB1, '482916', { tipo: 'merma', cantidad: 3, motivo: 'golpeadas en bodega' })
  assertEquals(r.status, 200)
  assertEquals(r.autorizado_por, 'Sub Uno')
  const m = tablas.movimientos_inventario[0]
  assertEquals(m.usuario_id, ADMIN)
  assertEquals(m.autorizado_por, SUB1)
  assertEquals(m.cantidad, 3)
  assertEquals(tablas.logs.at(-1)?.entidad, 'stock')
  assertEquals((tablas.logs.at(-1)?.detalle as { plancha: string }).plancha, 'Blanca 18mm')
  // la clave nunca queda en el registro de actividad
  assert(!JSON.stringify(tablas.logs).includes('482916'))
})

Deno.test('Movimiento: sin clave correcta no se registra nada', async () => {
  const { admin, tablas } = crearAdmin()
  await definir(admin, SUB1, '482916')
  assertEquals((await mov(admin, SUB1, 'incorrecta1')).status, 401)
  assertEquals((await mov(admin, SUB2, '482916')).status, 400) // Sub Dos aún sin clave
  assertEquals((await mov(admin, SUB_INACTIVO, '482916')).status, 401)
  assertEquals((await mov(admin, ADMIN, '482916')).status, 401) // un administrador no es subgerente
  assertEquals((await mov(admin, SUB1, '')).status, 400)
  assertEquals(tablas.movimientos_inventario.length, 0)
})

Deno.test('Movimiento: lo piden el administrador o un vendedor; un subgerente no registra movimientos', async () => {
  const { admin, tablas } = crearAdmin()
  await definir(admin, SUB1, '482916')
  assertEquals((await mov(admin, SUB1, '482916', {}, SUB1)).status, 403)
  assertEquals(tablas.movimientos_inventario.length, 0)
  // un vendedor puede, con la clave de un subgerente
  assertEquals((await mov(admin, SUB1, '482916', { tipo: 'merma', cantidad: 2, motivo: 'dañadas' }, VEND)).status, 200)
  assertEquals(tablas.movimientos_inventario[0].usuario_id, VEND)
  assertEquals(tablas.movimientos_inventario[0].autorizado_por, SUB1)
})

Deno.test('Ingreso y devolución NO piden clave; merma y ajuste SÍ', async () => {
  const { admin, tablas } = crearAdmin()
  await definir(admin, SUB1, '482916')
  const sinClave = (tipo: string, quien: string, extra: Record<string, unknown> = {}) =>
    llamar(admin, quien, { accion: 'movimiento', tipo_plancha_id: PLANCHA, tipo, cantidad: 4, motivo: 'prueba', ...extra })
  for (const quien of [ADMIN, VEND]) {
    assertEquals((await sinClave('ingreso', quien)).status, 200, 'ingreso ' + quien)
    assertEquals((await sinClave('devolucion', quien)).status, 200, 'devolucion ' + quien)
  }
  assertEquals(tablas.movimientos_inventario.length, 4)
  assert(tablas.movimientos_inventario.every(m => m.autorizado_por === null))
  // lo registra a nombre de quien lo hizo, y el registro de actividad no inventa un autorizador
  assertEquals(tablas.movimientos_inventario[1].usuario_id, ADMIN)
  // aunque llegue una clave equivocada en un ingreso, se ignora (no cuenta intentos ni bloquea)
  assertEquals((await sinClave('ingreso', ADMIN, { subgerente_id: SUB1, clave: 'x' })).status, 200)
  assertEquals(tablas.clave_subgerente[0].intentos, 0)
  // merma y ajuste sin clave: rechazados y no se registra nada
  for (const quien of [ADMIN, VEND]) {
    assertEquals((await sinClave('merma', quien)).status, 400, 'merma ' + quien)
    assertEquals((await sinClave('ajuste', quien)).status, 400, 'ajuste ' + quien)
    assertEquals((await sinClave('merma', quien, { subgerente_id: SUB1, clave: 'mala-mala' })).status, 401)
  }
  assertEquals(tablas.movimientos_inventario.length, 5)
})

Deno.test('Cuenta desactivada no puede usar la función', async () => {
  const { admin, tablas } = crearAdmin()
  tablas.profiles[0].activo = false
  assertEquals((await llamar(admin, ADMIN, { accion: 'lista' })).status, 403)
})

Deno.test('5 claves incorrectas bloquean 15 min; ni la clave buena sirve bloqueada; luego se reinicia', async () => {
  const { admin, tablas } = crearAdmin()
  await definir(admin, SUB1, '482916')
  const ahora = new Date()
  for (let i = 1; i <= 4; i++) assertEquals((await mov(admin, SUB1, 'mala-mala', {}, ADMIN, ahora)).status, 401)
  const quinto = await mov(admin, SUB1, 'mala-mala', {}, ADMIN, ahora)
  assertEquals(quinto.status, 429)
  assertEquals((await mov(admin, SUB1, '482916', {}, ADMIN, ahora)).status, 429)
  assertEquals(tablas.movimientos_inventario.length, 0)
  const despues = new Date(ahora.getTime() + 16 * 60000)
  assertEquals((await mov(admin, SUB1, '482916', {}, ADMIN, despues)).status, 200)
  assertEquals(tablas.clave_subgerente[0].intentos, 0)
})

Deno.test('Validaciones del movimiento: tipo, cantidad, motivo y plancha', async () => {
  const { admin, tablas } = crearAdmin()
  await definir(admin, SUB1, '482916')
  const ok = (extra: Record<string, unknown>) => mov(admin, SUB1, '482916', extra)
  assertEquals((await ok({ tipo: 'robo' })).status, 400)
  assertEquals((await ok({ cantidad: 0 })).status, 400)
  assertEquals((await ok({ tipo: 'merma', cantidad: -5, motivo: 'dañadas' })).status, 400) // solo el ajuste puede ser negativo
  assertEquals((await ok({ cantidad: 1.5 })).status, 400)
  assertEquals((await ok({ cantidad: '10' })).status, 400)
  assertEquals((await ok({ tipo: 'merma', cantidad: 2, motivo: '' })).status, 400)  // exige motivo
  assertEquals((await ok({ tipo_plancha_id: 'x' })).status, 400)
  assertEquals((await ok({ tipo: 'ajuste', cantidad: -4, motivo: 'conteo físico' })).status, 200)
  assertEquals(tablas.movimientos_inventario.length, 1)
})

Deno.test('Si la base rechaza el movimiento (stock insuficiente) se informa el motivo', async () => {
  const { admin } = crearAdmin({ message: 'Stock insuficiente: hay 2 planchas disponibles y el movimiento resta más' })
  await definir(admin, SUB1, '482916')
  const r = await mov(admin, SUB1, '482916', { tipo: 'merma', cantidad: 9, motivo: 'dañadas' })
  assertEquals(r.status, 400)
  assert(r.error.startsWith('Stock insuficiente'))
})

Deno.test('Un error interno de la base no filtra detalles', async () => {
  const { admin } = crearAdmin({ message: 'duplicate key value violates constraint secreto_interno' })
  await definir(admin, SUB1, '482916')
  const r = await mov(admin, SUB1, '482916')
  assertEquals(r.status, 500)
  assert(!r.error.includes('secreto_interno'))
})

Deno.test('Restablecer clave: solo administrador; después el subgerente crea una nueva sin pedir la anterior', async () => {
  const { admin, tablas } = crearAdmin()
  await definir(admin, SUB1, '482916')
  assertEquals((await llamar(admin, SUB2, { accion: 'restablecer', user_id: SUB1 })).status, 403)
  assertEquals(tablas.clave_subgerente.length, 1)
  assertEquals((await llamar(admin, ADMIN, { accion: 'restablecer', user_id: 'x' })).status, 400)
  assertEquals((await llamar(admin, ADMIN, { accion: 'restablecer', user_id: SUB1 })).status, 200)
  assertEquals(tablas.clave_subgerente.length, 0)
  assertEquals((await mov(admin, SUB1, '482916')).status, 400) // sin clave: no sirve la anterior
  assertEquals((await definir(admin, SUB1, '361849')).status, 200)
})

Deno.test('Estado: un subgerente consulta si ya tiene clave; otros roles no', async () => {
  const { admin } = crearAdmin()
  assertEquals((await llamar(admin, SUB1, { accion: 'estado' })).tiene_clave, false)
  await definir(admin, SUB1, '482916')
  assertEquals((await llamar(admin, SUB1, { accion: 'estado' })).tiene_clave, true)
  assertEquals((await llamar(admin, ADMIN, { accion: 'estado' })).status, 403)
})

Deno.test('Lista de subgerentes y activar/desactivar: solo un subgerente (nunca el administrador)', async () => {
  const { admin, tablas } = crearAdmin()
  await definir(admin, SUB1, '482916')
  assertEquals((await llamar(admin, ADMIN, { accion: 'lista_subgerentes' })).status, 403)
  assertEquals((await llamar(admin, VEND, { accion: 'lista_subgerentes' })).status, 403)
  const lista = await llamar(admin, SUB1, { accion: 'lista_subgerentes' })
  assertEquals(lista.subgerentes.length, 3)
  assertEquals(lista.subgerentes.find((s: { id: string }) => s.id === SUB1).tiene_clave, true)
  assertEquals(lista.subgerentes.find((s: { id: string }) => s.id === SUB2).tiene_clave, false)

  // el administrador no puede desactivar ni reactivar subgerentes
  assertEquals((await llamar(admin, ADMIN, { accion: 'estado_subgerente', user_id: SUB2, activo: false })).status, 403)
  assertEquals(tablas.profiles.find(p => p.id === SUB2)?.activo, true)
  // un subgerente sí; y no puede desactivarse a sí mismo
  assertEquals((await llamar(admin, SUB1, { accion: 'estado_subgerente', user_id: SUB2, activo: false })).status, 200)
  assertEquals(tablas.profiles.find(p => p.id === SUB2)?.activo, false)
  assertEquals((await llamar(admin, SUB1, { accion: 'estado_subgerente', user_id: SUB1, activo: false })).status, 400)
  // solo sobre cuentas de subgerente
  assertEquals((await llamar(admin, SUB1, { accion: 'estado_subgerente', user_id: VEND, activo: false })).status, 400)
  assertEquals((await llamar(admin, SUB1, { accion: 'estado_subgerente', user_id: 'x', activo: false })).status, 400)
  assertEquals(tablas.logs.at(-1)?.entidad, 'usuario')
})

Deno.test('Un subgerente desactivado ya no puede autorizar movimientos', async () => {
  const { admin } = crearAdmin()
  await definir(admin, SUB1, '482916')
  await definir(admin, SUB2, '908273')
  await llamar(admin, SUB1, { accion: 'estado_subgerente', user_id: SUB2, activo: false })
  assertEquals((await mov(admin, SUB2, '908273')).status, 401)
  assertEquals((await mov(admin, SUB1, '482916')).status, 200)
})
