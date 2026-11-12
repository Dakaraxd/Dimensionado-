import { assert, assertEquals } from 'jsr:@std/assert@1'
import { manejar as pinDispositivo } from './pin-dispositivo/handler.ts'
import { manejar as cambiarUsuario } from './cambiar-usuario/handler.ts'

const U1 = '11111111-1111-1111-1111-111111111111'
const U2 = '22222222-2222-2222-2222-222222222222'

// Base simulada en memoria con la forma mínima de la API de Supabase que usan las funciones
function crearAdmin() {
  const tablas: Record<string, Record<string, unknown>[]> = {
    dispositivos_pin: [],
    pin_usuario: [],
    profiles: [{ id: U1, nombre: 'Ana', activo: true, rol: 'administrador' }, { id: U2, nombre: 'Beto', activo: false, rol: 'vendedor' }],
    logs: [],
  }
  const usuarios: Record<string, string> = { [U1]: 'ana@test.cl', [U2]: 'beto@test.cl' }
  let seq = 0

  function constructor(tabla: string) {
    let filas = [...(tablas[tabla] ?? [])]
    let op: 'select' | 'update' | 'insert' | 'delete' = 'select'
    let cambios: Record<string, unknown> = {}
    let conteo = false
    const b = {
      select(_c?: string, o?: { count?: string; head?: boolean }) { if (o?.head) conteo = true; return b },
      eq(col: string, v: unknown) { filas = filas.filter(f => f[col] === v); return b },
      update(c: Record<string, unknown>) { op = 'update'; cambios = c; return b },
      delete() { op = 'delete'; return b },
      insert(c: Record<string, unknown>) {
        op = 'insert'
        tablas[tabla].push({ id: `id${++seq}`, intentos: 0, bloqueado_hasta: null, activo: true, ...c })
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
        if (op === 'update') { filas.forEach(f => Object.assign(f, cambios)); res = { data: filas.map(f => ({ id: f.id })), error: null } }
        else if (op === 'delete') { tablas[tabla] = tablas[tabla].filter(f => !filas.includes(f)); res = { data: null, error: null } }
        else if (conteo) res = { count: filas.length, error: null }
        else res = { data: filas, error: null }
        return Promise.resolve(res).then(ok, fail)
      },
    }
    return b
  }

  const admin = {
    from: constructor,
    auth: {
      admin: {
        getUserById: (id: string) => Promise.resolve(usuarios[id] ? { data: { user: { email: usuarios[id] } }, error: null } : { data: null, error: { message: 'no' } }),
        generateLink: ({ email }: { email: string }) => Promise.resolve({ data: { properties: { hashed_token: `token-de-${email}` } }, error: null }),
      },
    },
  }
  return { admin, tablas }
}

const post = (cuerpo: unknown) => new Request('http://x/', { method: 'POST', body: JSON.stringify(cuerpo) })
const leer = async (r: Response) => ({ status: r.status, ...(await r.json()) })

async function vincular(admin: unknown, usuario: string, pin: string, pin_actual?: string) {
  const r = await leer(await pinDispositivo(post({ accion: 'registrar', pin, pin_actual }), admin, usuario))
  assertEquals(r.status, 200)
  return r.secreto as string
}

Deno.test('Vincular equipo: devuelve un secreto y guarda solo hashes (nunca el PIN ni el secreto)', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  assert(secreto.length >= 40)
  const fila = tablas.dispositivos_pin[0]
  const guardado = JSON.stringify([fila, tablas.pin_usuario])
  assert(!guardado.includes(secreto) && !guardado.includes('4827'))
  assertEquals(tablas.pin_usuario.length, 1)
})

Deno.test('PIN débil o inválido se rechaza al vincular', async () => {
  const { admin, tablas } = crearAdmin()
  for (const pin of ['1234', '0000', '12', 'abcd', '48271', '482716']) {
    const r = await leer(await pinDispositivo(post({ accion: 'registrar', pin }), admin, U1))
    assertEquals(r.status, 400, pin)
  }
  assertEquals(tablas.dispositivos_pin.length, 0)
})

Deno.test('Cambiar usuario con equipo + PIN correctos entrega un token y registra el acceso', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  const r = await leer(await cambiarUsuario(post({ user_id: U1, secreto, pin: '4827' }), admin))
  assertEquals(r.status, 200)
  assertEquals(r.token_hash, 'token-de-ana@test.cl')
  assertEquals(tablas.logs.length, 1)
  assertEquals(tablas.logs[0].accion, 'ACCESO')
})

Deno.test('PIN incorrecto: avisa los intentos restantes y al 5° bloquea (ni el PIN bueno entra bloqueado)', async () => {
  const { admin } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  const mal = (pin = '9999') => cambiarUsuario(post({ user_id: U1, secreto, pin }), admin).then(leer)
  assertEquals((await mal()).error, 'PIN incorrecto. Te quedan 4 intentos.')
  assertEquals((await mal()).error, 'PIN incorrecto. Te quedan 3 intentos.')
  assertEquals((await mal()).error, 'PIN incorrecto. Te quedan 2 intentos.')
  assertEquals((await mal()).error, 'PIN incorrecto. Te queda 1 intento.')
  const quinto = await mal()
  assertEquals(quinto.status, 429)
  assertEquals(quinto.codigo, 'bloqueado')
  const conPinBueno = await mal('4827')
  assertEquals(conPinBueno.status, 429)
  assert(!conPinBueno.token_hash)
})

Deno.test('Tras el bloqueo vencido, el PIN correcto vuelve a funcionar y reinicia el contador', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  for (let i = 0; i < 5; i++) await cambiarUsuario(post({ user_id: U1, secreto, pin: '9999' }), admin)
  tablas.dispositivos_pin[0].bloqueado_hasta = new Date(Date.now() - 1000).toISOString()
  const r = await leer(await cambiarUsuario(post({ user_id: U1, secreto, pin: '4827' }), admin))
  assertEquals(r.status, 200)
  assertEquals(tablas.dispositivos_pin[0].intentos, 0)
})

Deno.test('10 fallos seguidos desactivan el equipo: ya no sirve ni con el PIN correcto', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  for (let i = 0; i < 10; i++) {
    tablas.dispositivos_pin[0].bloqueado_hasta = null // simula que pasó el bloqueo
    await cambiarUsuario(post({ user_id: U1, secreto, pin: '9999' }), admin)
  }
  assertEquals(tablas.dispositivos_pin[0].activo, false)
  const r = await leer(await cambiarUsuario(post({ user_id: U1, secreto, pin: '4827' }), admin))
  assertEquals(r.status, 403)
  assertEquals(r.codigo, 'desactivado')
})

Deno.test('Sin el secreto del equipo no hay forma de probar PINs (y no se toca ningún contador)', async () => {
  const { admin, tablas } = crearAdmin()
  await vincular(admin, U1, '4827')
  for (let i = 0; i < 20; i++) {
    const r = await leer(await cambiarUsuario(post({ user_id: U1, secreto: 'x'.repeat(43), pin: '4827' }), admin))
    assertEquals(r.status, 401)
    assertEquals(r.codigo, 'desconocido')
  }
  assertEquals(tablas.dispositivos_pin[0].intentos, 0)
})

Deno.test('El secreto de un usuario no sirve para entrar como otro', async () => {
  const { admin } = crearAdmin()
  const secretoU1 = await vincular(admin, U1, '4827')
  const r = await leer(await cambiarUsuario(post({ user_id: U2, secreto: secretoU1, pin: '4827' }), admin))
  assertEquals(r.status, 401)
})

Deno.test('Cuenta desactivada en el sistema: no entra aunque el PIN sea correcto', async () => {
  const { admin } = crearAdmin()
  const secreto = await vincular(admin, U2, '4827')
  const r = await leer(await cambiarUsuario(post({ user_id: U2, secreto, pin: '4827' }), admin))
  assertEquals(r.status, 403)
  assertEquals(r.codigo, 'cuenta_inactiva')
  assert(!r.token_hash)
})

Deno.test('Entradas mal formadas se rechazan sin consultar la base', async () => {
  const { admin } = crearAdmin()
  for (const cuerpo of [{}, { user_id: 'no-uuid', secreto: 'x'.repeat(43), pin: '4827' }, { user_id: U1, secreto: 'corto', pin: '4827' }, { user_id: U1, secreto: 'x'.repeat(43), pin: 'abcd' }]) {
    assertEquals((await leer(await cambiarUsuario(post(cuerpo), admin))).status, 400)
  }
})

Deno.test('Cambiar el PIN de un equipo conserva el secreto, reactiva y reinicia intentos; el PIN viejo deja de servir', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  tablas.dispositivos_pin[0].intentos = 3
  const r = await leer(await pinDispositivo(post({ accion: 'registrar', pin: '7351', pin_actual: '4827', secreto }), admin, U1))
  assertEquals(r.secreto, secreto)
  assertEquals(tablas.dispositivos_pin.length, 1)
  assertEquals((await leer(await cambiarUsuario(post({ user_id: U1, secreto, pin: '4827' }), admin))).status, 401)
  assertEquals((await leer(await cambiarUsuario(post({ user_id: U1, secreto, pin: '7351' }), admin))).status, 200)
})

Deno.test('Olvidar el equipo borra el registro y el secreto deja de servir', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  assertEquals((await leer(await pinDispositivo(post({ accion: 'olvidar', secreto }), admin, U1))).status, 200)
  assertEquals(tablas.dispositivos_pin.length, 0)
  assertEquals((await leer(await cambiarUsuario(post({ user_id: U1, secreto, pin: '4827' }), admin))).status, 401)
})

Deno.test('Un usuario no puede olvidar el equipo de otro', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  await pinDispositivo(post({ accion: 'olvidar', secreto }), admin, U2)
  assertEquals(tablas.dispositivos_pin.length, 1)
})

Deno.test('Límite de equipos por usuario', async () => {
  const { admin } = crearAdmin()
  await vincular(admin, U1, '4827')
  for (let i = 0; i < 9; i++) assertEquals((await leer(await pinDispositivo(post({ accion: 'activar' }), admin, U1))).status, 200)
  const r = await leer(await pinDispositivo(post({ accion: 'activar' }), admin, U1))
  assertEquals(r.status, 400)
})

Deno.test('Quitar el equipo NO borra el PIN: se vuelve a activar sin crear otro PIN', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  await pinDispositivo(post({ accion: 'olvidar', secreto }), admin, U1)
  assertEquals(tablas.dispositivos_pin.length, 0)
  assertEquals(tablas.pin_usuario.length, 1)
  const est = await leer(await pinDispositivo(post({ accion: 'estado' }), admin, U1))
  assertEquals(est.tiene_pin, true)
  const act = await leer(await pinDispositivo(post({ accion: 'activar' }), admin, U1))
  assertEquals(act.status, 200)
  // el PIN de siempre funciona en el equipo recién activado
  assertEquals((await leer(await cambiarUsuario(post({ user_id: U1, secreto: act.secreto, pin: '4827' }), admin))).status, 200)
})

Deno.test('Activar sin tener PIN se rechaza; el estado lo informa', async () => {
  const { admin, tablas } = crearAdmin()
  assertEquals((await leer(await pinDispositivo(post({ accion: 'estado' }), admin, U1))).tiene_pin, false)
  const r = await leer(await pinDispositivo(post({ accion: 'activar' }), admin, U1))
  assertEquals(r.status, 400)
  assertEquals(r.codigo, 'sin_pin')
  assertEquals(tablas.dispositivos_pin.length, 0)
})

Deno.test('El PIN es el mismo en todos los equipos y cambiarlo en uno lo cambia en todos', async () => {
  const { admin } = crearAdmin()
  const a = await vincular(admin, U1, '4827')
  const b = (await leer(await pinDispositivo(post({ accion: 'activar' }), admin, U1))).secreto as string
  assert(a !== b)
  assertEquals((await leer(await cambiarUsuario(post({ user_id: U1, secreto: b, pin: '4827' }), admin))).status, 200)
  await pinDispositivo(post({ accion: 'registrar', pin: '7351', pin_actual: '4827', secreto: a }), admin, U1)
  assertEquals((await leer(await cambiarUsuario(post({ user_id: U1, secreto: b, pin: '4827' }), admin))).status, 401)
  assertEquals((await leer(await cambiarUsuario(post({ user_id: U1, secreto: b, pin: '7351' }), admin))).status, 200)
})

Deno.test('Activar con el secreto de un equipo desactivado lo reactiva y reinicia los intentos', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  tablas.dispositivos_pin[0].activo = false
  tablas.dispositivos_pin[0].intentos = 10
  const r = await leer(await pinDispositivo(post({ accion: 'activar', secreto }), admin, U1))
  assertEquals(r.secreto, secreto)
  assertEquals(tablas.dispositivos_pin[0].activo, true)
  assertEquals(tablas.dispositivos_pin[0].intentos, 0)
})

Deno.test('Un equipo sin PIN de usuario (PIN eliminado) no deja entrar', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  tablas.pin_usuario.length = 0
  const r = await leer(await cambiarUsuario(post({ user_id: U1, secreto, pin: '4827' }), admin))
  assertEquals(r.status, 401)
  assertEquals(r.codigo, 'desconocido')
})

Deno.test('Cambiar un PIN existente exige el PIN actual: sin él o con uno malo se rechaza y el PIN no cambia', async () => {
  const { admin } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  const sin = await leer(await pinDispositivo(post({ accion: 'registrar', pin: '7351', secreto }), admin, U1))
  assertEquals(sin.status, 400)
  assertEquals(sin.codigo, 'pin_actual_requerido')
  const mal = await leer(await pinDispositivo(post({ accion: 'registrar', pin: '7351', pin_actual: '9999', secreto }), admin, U1))
  assertEquals(mal.status, 401)
  assertEquals(mal.error, 'PIN actual incorrecto. Te quedan 4 intentos.')
  // el PIN original sigue funcionando
  assertEquals((await leer(await cambiarUsuario(post({ user_id: U1, secreto, pin: '4827' }), admin))).status, 200)
  // y con el PIN actual correcto sí se cambia
  assertEquals((await leer(await pinDispositivo(post({ accion: 'registrar', pin: '7351', pin_actual: '4827', secreto }), admin, U1))).status, 200)
  assertEquals((await leer(await cambiarUsuario(post({ user_id: U1, secreto, pin: '7351' }), admin))).status, 200)
})

Deno.test('Adivinar el PIN actual: al 5° fallo se bloquea 15 min (ni el PIN bueno sirve) y luego se recupera', async () => {
  const { admin, tablas } = crearAdmin()
  const secreto = await vincular(admin, U1, '4827')
  const intento = (p: string, ahora?: Date) => pinDispositivo(post({ accion: 'registrar', pin: '7351', pin_actual: p, secreto }), admin, U1, ahora).then(leer)
  for (let i = 0; i < 4; i++) assertEquals((await intento('9999')).status, 401)
  const quinto = await intento('9999')
  assertEquals(quinto.status, 429)
  assertEquals((await intento('4827')).status, 429)
  // pasado el bloqueo, el PIN correcto funciona y reinicia los contadores
  const despues = new Date(Date.now() + 16 * 60000)
  assertEquals((await intento('4827', despues)).status, 200)
  assertEquals(tablas.pin_usuario[0].intentos_cambio, 0)
  assertEquals(tablas.pin_usuario[0].bloqueado_cambio_hasta, null)
})

Deno.test('Restablecer PIN: solo un administrador; borra el PIN y los equipos de la persona', async () => {
  const { admin, tablas } = crearAdmin()
  await vincular(admin, U2, '4827')
  assertEquals(tablas.pin_usuario.length, 1)
  // un vendedor (U2) no puede
  assertEquals((await leer(await pinDispositivo(post({ accion: 'restablecer', user_id: U2 }), admin, U2))).status, 403)
  assertEquals(tablas.pin_usuario.length, 1)
  // el administrador (U1) sí
  assertEquals((await leer(await pinDispositivo(post({ accion: 'restablecer', user_id: U2 }), admin, U1))).status, 200)
  assertEquals(tablas.pin_usuario.length, 0)
  assertEquals(tablas.dispositivos_pin.length, 0)
  assertEquals(tablas.logs.at(-1)?.accion, 'EDITAR')
  // y la persona ya puede crear un PIN nuevo sin pedir el anterior
  assertEquals((await leer(await pinDispositivo(post({ accion: 'registrar', pin: '7351' }), admin, U2))).status, 200)
})

Deno.test('Restablecer PIN rechaza usuarios mal formados', async () => {
  const { admin } = crearAdmin()
  assertEquals((await leer(await pinDispositivo(post({ accion: 'restablecer', user_id: 'x' }), admin, U1))).status, 400)
})
