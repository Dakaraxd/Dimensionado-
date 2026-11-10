import { json } from '../_shared/http.ts'
import { generarSal, generarSecreto, hashPin, MAX_EQUIPOS_POR_USUARIO, pinValido, sha256Hex } from '../_shared/pin.ts'

// deno-lint-ignore no-explicit-any
export type Admin = any

// El PIN es de la persona (tabla pin_usuario); cada equipo tiene solo su secreto (dispositivos_pin).
// Requiere sesión iniciada: `usuarioId` viene de un JWT ya verificado.
export async function manejar(req: Request, admin: Admin, usuarioId: string): Promise<Response> {
  try {
    const { accion, pin, secreto } = await req.json()

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
      const sal = generarSal()
      const { error } = await admin.from('pin_usuario')
        .upsert({ user_id: usuarioId, pin_salt: sal, pin_hash: await hashPin(pin, sal), actualizado_en: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
      return await vincularEquipo()
    }

    // Vincula este equipo reutilizando el PIN que la persona ya tiene
    if (accion === 'activar') {
      const { data } = await admin.from('pin_usuario').select('user_id').eq('user_id', usuarioId).maybeSingle()
      if (!data) return json({ error: 'Aún no tienes un PIN. Créalo primero.', codigo: 'sin_pin' }, 400)
      return await vincularEquipo()
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
