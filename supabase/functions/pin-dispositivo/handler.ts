import { json } from '../_shared/http.ts'
import { generarSal, generarSecreto, hashPin, MAX_EQUIPOS_POR_USUARIO, pinValido, sha256Hex } from '../_shared/pin.ts'

// deno-lint-ignore no-explicit-any
export type Admin = any

// Vincula el equipo actual con un PIN (o cambia el PIN) y permite olvidar el equipo.
// Requiere sesión iniciada: `usuarioId` viene de un JWT ya verificado.
export async function manejar(req: Request, admin: Admin, usuarioId: string): Promise<Response> {
  try {
    const { accion, pin, secreto } = await req.json()

    if (accion === 'registrar') {
      if (!pinValido(pin)) {
        return json({ error: 'El PIN debe tener de 4 a 6 dígitos y no ser evidente (por ejemplo 1234 o 0000).' }, 400)
      }
      const sal = generarSal()
      const pin_hash = await hashPin(pin, sal)

      // Cambiar el PIN de un equipo ya vinculado
      if (typeof secreto === 'string' && secreto) {
        const { data: filas, error } = await admin.from('dispositivos_pin')
          .update({ pin_salt: sal, pin_hash, intentos: 0, bloqueado_hasta: null, activo: true })
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
        .insert({ user_id: usuarioId, secreto_hash: await sha256Hex(nuevoSecreto), pin_salt: sal, pin_hash })
      if (error) throw error
      return json({ ok: true, secreto: nuevoSecreto })
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
