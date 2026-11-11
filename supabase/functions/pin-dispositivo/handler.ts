import { json } from '../_shared/http.ts'
import { BLOQUEO_MINUTOS, generarSal, generarSecreto, hashPin, igualesConstante, MAX_EQUIPOS_POR_USUARIO, MAX_INTENTOS, pinValido, sha256Hex } from '../_shared/pin.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

// deno-lint-ignore no-explicit-any
export type Admin = any

// El PIN es de la persona (tabla pin_usuario); cada equipo tiene solo su secreto (dispositivos_pin).
// Requiere sesión iniciada: `usuarioId` viene de un JWT ya verificado.
export async function manejar(req: Request, admin: Admin, usuarioId: string, ahora = new Date()): Promise<Response> {
  try {
    const { accion, pin, secreto, pin_actual, user_id } = await req.json()

    // Vincula este equipo con la sesión actual. Si el secreto ya existe para este usuario lo reactiva.
    async function vincularEquipo(): Promise<Response> {
      if (typeof secreto === 'string' && secreto) {
        const { data: filas, error } = await admin.from('dispositivos_pin')
          .update({ intentos: 0, bloqueado_hasta: null, activo: true })
          .eq('secreto_hash', await sha256Hex(secreto)).eq('user_id', usuarioId).select('id')
        if (error) throw error
        if (filas?.length) return json({ ok: true, secreto })
      }

      const { count } = await admin.from('dispositivos_pin')
        .select('id', { count: 'exact', head: true }).eq('user_id', usuarioId)
      if ((count ?? 0) >= MAX_EQUIPOS_POR_USUARIO) {
        return json({ error: 'Tienes demasiados equipos vinculados. Quita alguno e inténtalo de nuevo.' }, 400)
      }

      const nuevoSecreto = generarSecreto()
      const { error } = await admin.from('dispositivos_pin')
        .insert({ user_id: usuarioId, secreto_hash: await sha256Hex(nuevoSecreto) })
      if (error) throw error
      return json({ ok: true, secreto: nuevoSecreto })
    }

    // ¿La persona ya tiene PIN? (para ofrecer "activar" en vez de "crear")
    if (accion === 'estado') {
      const { data } = await admin.from('pin_usuario').select('user_id').eq('user_id', usuarioId).maybeSingle()
      return json({ ok: true, tiene_pin: !!data })
    }

    // Crea o cambia el PIN de la persona y vincula este equipo
    if (accion === 'registrar') {
      if (!pinValido(pin)) {
        return json({ error: 'El PIN debe tener 4 dígitos y no ser evidente (por ejemplo 1234 o 0000).' }, 400)
      }
      // Si ya tiene PIN, para cambiarlo hay que demostrar que se conoce el actual
      const { data: existente } = await admin.from('pin_usuario')
        .select('pin_salt, pin_hash, intentos_cambio, bloqueado_cambio_hasta').eq('user_id', usuarioId).maybeSingle()
      if (existente) {
        if (typeof pin_actual !== 'string' || !/^\d{4}$/.test(pin_actual)) {
          return json({ error: 'Escribe tu PIN actual para poder cambiarlo.', codigo: 'pin_actual_requerido' }, 400)
        }
        if (existente.bloqueado_cambio_hasta && new Date(existente.bloqueado_cambio_hasta) > ahora) {
          const min = Math.max(1, Math.ceil((new Date(existente.bloqueado_cambio_hasta).getTime() - ahora.getTime()) / 60000))
          return json({ error: `Demasiados intentos. Intenta de nuevo en ${plural(min, 'minuto')}.`, codigo: 'bloqueado' }, 429)
        }
        if (!igualesConstante(await hashPin(pin_actual, existente.pin_salt), existente.pin_hash)) {
          const intentos = (existente.intentos_cambio ?? 0) + 1
          const bloquear = intentos >= MAX_INTENTOS
          await admin.from('pin_usuario').update({
            intentos_cambio: bloquear ? 0 : intentos,
            bloqueado_cambio_hasta: bloquear ? new Date(ahora.getTime() + BLOQUEO_MINUTOS * 60000).toISOString() : null,
          }).eq('user_id', usuarioId)
          if (bloquear) return json({ error: `PIN actual incorrecto. Bloqueado por ${BLOQUEO_MINUTOS} minutos.`, codigo: 'bloqueado' }, 429)
          const quedan = MAX_INTENTOS - intentos
          return json({ error: `PIN actual incorrecto. Te ${quedan === 1 ? 'queda' : 'quedan'} ${plural(quedan, 'intento')}.`, codigo: 'pin_actual_incorrecto' }, 401)
        }
      }

      const sal = generarSal()
      const { error } = await admin.from('pin_usuario')
        .upsert({
          user_id: usuarioId, pin_salt: sal, pin_hash: await hashPin(pin, sal),
          intentos_cambio: 0, bloqueado_cambio_hasta: null, actualizado_en: ahora.toISOString(),
        }, { onConflict: 'user_id' })
      if (error) throw error
      return await vincularEquipo()
    }

    // Vincula este equipo reutilizando el PIN que la persona ya tiene
    if (accion === 'activar') {
      const { data } = await admin.from('pin_usuario').select('user_id').eq('user_id', usuarioId).maybeSingle()
      if (!data) return json({ error: 'Aún no tienes un PIN. Créalo primero.', codigo: 'sin_pin' }, 400)
      return await vincularEquipo()
    }

    // Un administrador borra el PIN de una persona (por ejemplo si lo olvidó) y desvincula sus equipos.
    // Después ella crea uno nuevo iniciando sesión con su contraseña.
    if (accion === 'restablecer') {
      if (typeof user_id !== 'string' || !UUID.test(user_id)) return json({ error: 'Usuario no válido.' }, 400)
      const { data: yo } = await admin.from('profiles').select('rol, nombre').eq('id', usuarioId).maybeSingle()
      if (yo?.rol !== 'administrador') return json({ error: 'Solo un administrador puede restablecer un PIN.' }, 403)
      const { error: e1 } = await admin.from('pin_usuario').delete().eq('user_id', user_id)
      if (e1) throw e1
      const { error: e2 } = await admin.from('dispositivos_pin').delete().eq('user_id', user_id)
      if (e2) throw e2
      await admin.from('logs').insert({
        usuario_id: usuarioId, usuario_nombre: yo.nombre, accion: 'EDITAR', entidad: 'usuario',
        detalle: { cambio: 'PIN restablecido', usuario_id: user_id }
      })
      return json({ ok: true })
    }

    if (accion === 'olvidar') {
      if (typeof secreto !== 'string' || !secreto) return json({ error: 'Falta el equipo.' }, 400)
      const { error } = await admin.from('dispositivos_pin')
        .delete().eq('secreto_hash', await sha256Hex(secreto)).eq('user_id', usuarioId)
      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: 'Acción no válida.' }, 400)
  } catch (e) {
    console.error('pin-dispositivo:', e)
    return json({ error: 'Error del servidor.' }, 500)
  }
}
