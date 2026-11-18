import { json } from '../_shared/http.ts'
import { BLOQUEO_MINUTOS, generarSal, hashPin, igualesConstante, MAX_INTENTOS } from '../_shared/pin.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIPOS = ['ingreso', 'merma', 'devolucion', 'ajuste']
const EXIGEN_MOTIVO = ['merma', 'devolucion', 'ajuste']
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

// deno-lint-ignore no-explicit-any
export type Admin = any

// La clave de autorización: de 6 a 64 caracteres
export const claveValida = (c: unknown): c is string => typeof c === 'string' && c.length >= 6 && c.length <= 64

// Mensajes de la base que se pueden mostrar tal cual (los demás se resumen)
const MENSAJE_SEGURO = /Stock insuficiente|mayor que lo vendido|No existe stock/i

type Verificacion = { ok: true; nombre: string } | { ok: false; respuesta: Response }

// Comprueba la clave de un subgerente. 5 fallos seguidos bloquean 15 minutos.
async function verificarClave(admin: Admin, subgerenteId: string, clave: string, ahora: Date): Promise<Verificacion> {
  const generico = (cod: string) => ({ ok: false as const, respuesta: json({ error: 'Subgerente o clave incorrectos.', codigo: cod }, 401) })

  const { data: perfil } = await admin.from('profiles').select('rol, nombre, activo').eq('id', subgerenteId).maybeSingle()
  if (!perfil || perfil.rol !== 'subgerente' || perfil.activo === false) return generico('incorrecta')

  const { data: fila } = await admin.from('clave_subgerente')
    .select('clave_salt, clave_hash, intentos, bloqueado_hasta').eq('user_id', subgerenteId).maybeSingle()
  if (!fila) return { ok: false, respuesta: json({ error: 'Ese subgerente aún no ha creado su clave de autorización.', codigo: 'sin_clave' }, 400) }

  if (fila.bloqueado_hasta && new Date(fila.bloqueado_hasta) > ahora) {
    const min = Math.max(1, Math.ceil((new Date(fila.bloqueado_hasta).getTime() - ahora.getTime()) / 60000))
    return { ok: false, respuesta: json({ error: `Demasiados intentos. Intenta de nuevo en ${plural(min, 'minuto')}.`, codigo: 'bloqueado' }, 429) }
  }

  if (!igualesConstante(await hashPin(clave, fila.clave_salt), fila.clave_hash)) {
    const intentos = (fila.intentos ?? 0) + 1
    const bloquear = intentos >= MAX_INTENTOS
    await admin.from('clave_subgerente').update({
      intentos: bloquear ? 0 : intentos,
      bloqueado_hasta: bloquear ? new Date(ahora.getTime() + BLOQUEO_MINUTOS * 60000).toISOString() : null,
    }).eq('user_id', subgerenteId)
    if (bloquear) return { ok: false, respuesta: json({ error: `Clave incorrecta. Bloqueada por ${BLOQUEO_MINUTOS} minutos.`, codigo: 'bloqueado' }, 429) }
    const quedan = MAX_INTENTOS - intentos
    return { ok: false, respuesta: json({ error: `Clave incorrecta. Te ${quedan === 1 ? 'queda' : 'quedan'} ${plural(quedan, 'intento')}.`, codigo: 'incorrecta' }, 401) }
  }

  if (fila.intentos) await admin.from('clave_subgerente').update({ intentos: 0, bloqueado_hasta: null }).eq('user_id', subgerenteId)
  return { ok: true, nombre: perfil.nombre }
}

// Requiere sesión iniciada: `usuarioId` viene de un JWT ya verificado.
//   lista        (administrador)  → subgerentes activos que ya tienen clave
//   estado       (subgerente)     → ¿ya tengo clave?
//   definir      (subgerente)     → crea o cambia SU clave (pide la actual si ya tiene)
//   restablecer  (administrador)  → borra la clave de un subgerente (la olvidó)
//   movimiento   (administrador)  → registra un movimiento de inventario con la clave de un subgerente
//   lista_subgerentes / estado_subgerente (subgerente) → ver y activar/desactivar cuentas de subgerente
export async function manejar(req: Request, admin: Admin, usuarioId: string, ahora = new Date()): Promise<Response> {
  try {
    const cuerpo = await req.json()
    const { accion } = cuerpo

    const { data: yo } = await admin.from('profiles').select('rol, nombre, activo').eq('id', usuarioId).maybeSingle()
    if (!yo || yo.activo === false) return json({ error: 'Tu cuenta no está activa.' }, 403)
    const esAdmin = yo.rol === 'administrador'

    if (accion === 'lista') {
      if (!esAdmin) return json({ error: 'No tienes permiso.' }, 403)
      const { data: perfiles } = await admin.from('profiles').select('id, nombre, rol, activo').eq('rol', 'subgerente')
      const { data: claves } = await admin.from('clave_subgerente').select('user_id')
      const conClave = new Set((claves ?? []).map((c: { user_id: string }) => c.user_id))
      const subgerentes = (perfiles ?? [])
        .filter((p: { id: string; activo: boolean }) => p.activo !== false && conClave.has(p.id))
        .map((p: { id: string; nombre: string }) => ({ id: p.id, nombre: p.nombre }))
      return json({ ok: true, subgerentes })
    }

    // Gestión de las cuentas de subgerente: solo la hace un subgerente (el administrador no).
    if (accion === 'lista_subgerentes') {
      if (yo.rol !== 'subgerente') return json({ error: 'No tienes permiso.' }, 403)
      const { data: perfiles } = await admin.from('profiles').select('id, nombre, email, rol, activo').eq('rol', 'subgerente')
      const { data: claves } = await admin.from('clave_subgerente').select('user_id')
      const conClave = new Set((claves ?? []).map((c: { user_id: string }) => c.user_id))
      const subgerentes = (perfiles ?? []).map((p: { id: string; nombre: string; email: string; activo: boolean }) => ({
        id: p.id, nombre: p.nombre, email: p.email, activo: p.activo !== false, tiene_clave: conClave.has(p.id),
      }))
      return json({ ok: true, subgerentes })
    }

    if (accion === 'estado_subgerente') {
      if (yo.rol !== 'subgerente') return json({ error: 'Solo un subgerente puede activar o desactivar cuentas de subgerente.' }, 403)
      if (typeof cuerpo.user_id !== 'string' || !UUID.test(cuerpo.user_id) || typeof cuerpo.activo !== 'boolean') {
        return json({ error: 'Datos no válidos.' }, 400)
      }
      if (cuerpo.user_id === usuarioId) return json({ error: 'No puedes desactivar tu propia cuenta.' }, 400)
      const { data: objetivo } = await admin.from('profiles').select('rol, nombre').eq('id', cuerpo.user_id).maybeSingle()
      if (!objetivo || objetivo.rol !== 'subgerente') return json({ error: 'Esa cuenta no es de un subgerente.' }, 400)
      const { error } = await admin.from('profiles').update({ activo: cuerpo.activo }).eq('id', cuerpo.user_id)
      if (error) throw error
      await admin.from('logs').insert({
        usuario_id: usuarioId, usuario_nombre: yo.nombre, accion: 'EDITAR', entidad: 'usuario',
        detalle: { cambio: cuerpo.activo ? 'Subgerente activado' : 'Subgerente desactivado', usuario_id: cuerpo.user_id, nombre: objetivo.nombre }
      })
      return json({ ok: true })
    }

    if (accion === 'estado') {
      if (yo.rol !== 'subgerente') return json({ error: 'No tienes permiso.' }, 403)
      const { data } = await admin.from('clave_subgerente').select('user_id').eq('user_id', usuarioId).maybeSingle()
      return json({ ok: true, tiene_clave: !!data })
    }

    if (accion === 'definir') {
      if (yo.rol !== 'subgerente') return json({ error: 'Solo un subgerente puede crear su clave.' }, 403)
      if (!claveValida(cuerpo.clave)) return json({ error: 'La clave debe tener al menos 6 caracteres.' }, 400)
      const { data: existente } = await admin.from('clave_subgerente')
        .select('clave_salt, clave_hash, intentos, bloqueado_hasta').eq('user_id', usuarioId).maybeSingle()
      if (existente) {
        if (typeof cuerpo.clave_actual !== 'string' || !cuerpo.clave_actual) {
          return json({ error: 'Escribe tu clave actual para poder cambiarla.', codigo: 'clave_actual_requerida' }, 400)
        }
        const v = await verificarClave(admin, usuarioId, cuerpo.clave_actual, ahora)
        if (!v.ok) return v.respuesta
      }
      const sal = generarSal()
      const { error } = await admin.from('clave_subgerente').upsert({
        user_id: usuarioId, clave_salt: sal, clave_hash: await hashPin(cuerpo.clave, sal),
        intentos: 0, bloqueado_hasta: null, actualizado_en: ahora.toISOString(),
      }, { onConflict: 'user_id' })
      if (error) throw error
      await admin.from('logs').insert({
        usuario_id: usuarioId, usuario_nombre: yo.nombre, accion: 'EDITAR', entidad: 'usuario',
        detalle: { cambio: existente ? 'Clave de autorización cambiada' : 'Clave de autorización creada' }
      })
      return json({ ok: true })
    }

    if (accion === 'restablecer') {
      if (!esAdmin) return json({ error: 'Solo un administrador puede restablecer una clave.' }, 403)
      if (typeof cuerpo.user_id !== 'string' || !UUID.test(cuerpo.user_id)) return json({ error: 'Usuario no válido.' }, 400)
      const { error } = await admin.from('clave_subgerente').delete().eq('user_id', cuerpo.user_id)
      if (error) throw error
      await admin.from('logs').insert({
        usuario_id: usuarioId, usuario_nombre: yo.nombre, accion: 'EDITAR', entidad: 'usuario',
        detalle: { cambio: 'Clave de autorización restablecida', usuario_id: cuerpo.user_id }
      })
      return json({ ok: true })
    }

    if (accion === 'movimiento') {
      if (!esAdmin) return json({ error: 'Solo un administrador puede registrar movimientos de inventario.' }, 403)
      const { subgerente_id, clave, tipo_plancha_id, tipo } = cuerpo
      const motivo = typeof cuerpo.motivo === 'string' ? cuerpo.motivo.trim() : ''
      const referencia = typeof cuerpo.referencia === 'string' ? cuerpo.referencia.trim() : ''
      const cantidad = cuerpo.cantidad

      if (typeof subgerente_id !== 'string' || !UUID.test(subgerente_id) || typeof clave !== 'string' || !clave) {
        return json({ error: 'Elige al subgerente e ingresa su clave.' }, 400)
      }
      if (typeof tipo_plancha_id !== 'string' || !UUID.test(tipo_plancha_id)) return json({ error: 'Plancha no válida.' }, 400)
      if (!TIPOS.includes(tipo)) return json({ error: 'Tipo de movimiento no válido.' }, 400)
      if (!Number.isInteger(cantidad) || cantidad === 0 || Math.abs(cantidad) > 100000 || (tipo !== 'ajuste' && cantidad < 0)) {
        return json({ error: 'La cantidad no es válida.' }, 400)
      }
      if (EXIGEN_MOTIVO.includes(tipo) && motivo.length < 3) return json({ error: 'Indica el motivo (mínimo 3 letras).' }, 400)
      if (motivo.length > 300 || referencia.length > 300) return json({ error: 'El motivo o la referencia es demasiado largo.' }, 400)

      const v = await verificarClave(admin, subgerente_id, clave, ahora)
      if (!v.ok) return v.respuesta

      const { error } = await admin.from('movimientos_inventario').insert({
        tipo_plancha_id, tipo, cantidad, motivo: motivo || null, referencia: referencia || null,
        usuario_id: usuarioId, autorizado_por: subgerente_id,
      })
      if (error) {
        const m = String(error.message ?? '')
        if (MENSAJE_SEGURO.test(m)) return json({ error: m, codigo: 'rechazado' }, 400)
        console.error('autorizar-stock insert:', error)
        return json({ error: 'No se pudo registrar el movimiento. Intenta de nuevo.' }, 500)
      }
      await admin.from('logs').insert({
        usuario_id: usuarioId, usuario_nombre: yo.nombre, accion: 'EDITAR', entidad: 'stock',
        detalle: { movimiento: tipo, cantidad, tipo_plancha_id, autorizado_por: v.nombre }
      })
      return json({ ok: true, autorizado_por: v.nombre })
    }

    return json({ error: 'Acción no válida.' }, 400)
  } catch (e) {
    console.error('autorizar-stock:', e)
    return json({ error: 'Error del servidor.' }, 500)
  }
}
