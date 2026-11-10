import { cors, json } from '../_shared/http.ts'
import { evaluarIntento, hashPin, igualesConstante, sha256Hex } from '../_shared/pin.ts'

// deno-lint-ignore no-explicit-any
export type Admin = any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

// Cambia de usuario verificando el PIN. Se llama SIN sesión (el usuario puede estar
// cerrado), por eso exige el secreto del equipo además del PIN: sin el equipo vinculado
// nadie puede probar PINs desde internet.
export async function manejar(req: Request, admin: Admin, ahora = new Date()): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const { user_id, secreto, pin } = await req.json()
    if (typeof user_id !== 'string' || !UUID.test(user_id) ||
        typeof secreto !== 'string' || secreto.length < 30 || secreto.length > 100 ||
        typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return json({ error: 'No se pudo verificar.' }, 400)
    }

    const { data: disp } = await admin
      .from('dispositivos_pin')
      .select('id, intentos, bloqueado_hasta, activo')
      .eq('secreto_hash', await sha256Hex(secreto))
      .eq('user_id', user_id)
      .maybeSingle()

    if (!disp) {
      return json({ error: 'No se pudo verificar. Inicia sesión con tu contraseña.', codigo: 'desconocido' }, 401)
    }

    // El PIN es de la persona; solo se consulta una vez que el equipo ya fue reconocido
    const { data: pinUsuario } = await admin.from('pin_usuario').select('pin_salt, pin_hash').eq('user_id', user_id).maybeSingle()
    if (!pinUsuario) {
      return json({ error: 'No se pudo verificar. Inicia sesión con tu contraseña.', codigo: 'desconocido' }, 401)
    }

    const pinCorrecto = igualesConstante(await hashPin(pin, pinUsuario.pin_salt), pinUsuario.pin_hash)
    const decision = evaluarIntento(disp, ahora, pinCorrecto)
    if (decision.cambios) await admin.from('dispositivos_pin').update(decision.cambios).eq('id', disp.id)

    if (decision.estado === 'bloqueado') {
      return json({ error: `Demasiados intentos. Intenta de nuevo en ${plural(decision.minutos, 'minuto')}.`, codigo: 'bloqueado' }, 429)
    }
    if (decision.estado === 'desactivado') {
      return json({ error: 'Este equipo fue desactivado por seguridad. Inicia sesión con tu contraseña para volver a vincularlo.', codigo: 'desactivado' }, 403)
    }
    if (decision.estado === 'pin_incorrecto') {
      if (!decision.cambios.activo) {
        return json({ error: 'PIN incorrecto. El equipo fue desactivado por seguridad: inicia sesión con tu contraseña.', codigo: 'desactivado' }, 403)
      }
      if (decision.restantes === 0) {
        return json({ error: 'PIN incorrecto. Equipo bloqueado por 15 minutos.', codigo: 'bloqueado' }, 429)
      }
      return json({ error: `PIN incorrecto. Te ${decision.restantes === 1 ? 'queda' : 'quedan'} ${plural(decision.restantes, 'intento')}.`, codigo: 'pin_incorrecto' }, 401)
    }

    // PIN correcto: la cuenta debe seguir activa
    const { data: perfil } = await admin.from('profiles').select('nombre, activo').eq('id', user_id).maybeSingle()
    if (!perfil || perfil.activo === false) {
      return json({ error: 'Tu cuenta no está activa. Contacta al administrador.', codigo: 'cuenta_inactiva' }, 403)
    }

    const { data: u, error: errU } = await admin.auth.admin.getUserById(user_id)
    const email = u?.user?.email
    if (errU || !email) return json({ error: 'No se pudo completar el acceso.' }, 500)

    // El enlace NO se envía por correo: solo se canjea en el navegador para abrir la sesión.
    const { data: enlace, error: errL } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const token_hash = enlace?.properties?.hashed_token
    if (errL || !token_hash) return json({ error: 'No se pudo completar el acceso.' }, 500)

    await admin.from('logs').insert({
      usuario_id: user_id, usuario_nombre: perfil.nombre, accion: 'ACCESO', entidad: 'sesion', detalle: { metodo: 'PIN' }
    })
    return json({ ok: true, token_hash })
  } catch (e) {
    console.error('cambiar-usuario:', e)
    return json({ error: 'Error del servidor.' }, 500)
  }
}
