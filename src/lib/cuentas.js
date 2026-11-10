import { supabase } from './supabase'

// Cuentas "recordadas" en este equipo para el cambio rápido de usuario.
// Cada una guarda el secreto del equipo (solo sirve junto con el PIN de esa persona).
const CLAVE = 'dimensionado.cuentas.v1'

export function leerCuentas() {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE) ?? '[]')
    return Array.isArray(lista) ? lista.filter(c => c?.user_id && c?.secreto) : []
  } catch {
    return []
  }
}

function escribir(lista) {
  try { localStorage.setItem(CLAVE, JSON.stringify(lista)) } catch { /* sin almacenamiento disponible */ }
}

export function guardarCuenta(cuenta) {
  escribir([cuenta, ...leerCuentas().filter(c => c.user_id !== cuenta.user_id)])
}

export function quitarCuenta(userId) {
  escribir(leerCuentas().filter(c => c.user_id !== userId))
}

export function cuentaDe(userId) {
  return leerCuentas().find(c => c.user_id === userId) ?? null
}

// Las funciones de servidor responden { error, codigo } con códigos HTTP de error
async function leerError(error, mensajePorDefecto) {
  try {
    const cuerpo = await error.context.json()
    return { error: cuerpo?.error ?? mensajePorDefecto, codigo: cuerpo?.codigo }
  } catch {
    return { error: mensajePorDefecto }
  }
}

// Vincula este equipo con el PIN del usuario que tiene la sesión iniciada.
// Si el equipo ya estaba vinculado (se pasa su secreto) solo cambia el PIN.
export async function vincularEquipo({ pin, secreto }) {
  const { data, error } = await supabase.functions.invoke('pin-dispositivo', {
    body: { accion: 'registrar', pin, secreto }
  })
  if (error) return leerError(error, 'No se pudo guardar el PIN. Intenta de nuevo.')
  return { secreto: data.secreto }
}

// ¿La persona ya tiene un PIN creado (en cualquier equipo)? Si sí, este equipo solo hay que activarlo.
export async function consultarPin() {
  const { data, error } = await supabase.functions.invoke('pin-dispositivo', { body: { accion: 'estado' } })
  return error ? { tiene: null } : { tiene: !!data?.tiene_pin }
}

// Activa este equipo reutilizando el PIN que la persona ya tiene (sin crear otro)
export async function activarEquipo({ secreto }) {
  const { data, error } = await supabase.functions.invoke('pin-dispositivo', { body: { accion: 'activar', secreto } })
  if (error) return leerError(error, 'No se pudo activar el acceso rápido. Intenta de nuevo.')
  return { secreto: data.secreto }
}

export async function olvidarEquipo(secreto) {
  const { error } = await supabase.functions.invoke('pin-dispositivo', {
    body: { accion: 'olvidar', secreto }
  })
  return error ? leerError(error, 'No se pudo quitar el equipo.') : {}
}

// Cambia a otra cuenta usando el PIN. Devuelve { error, codigo } si falla;
// si sale bien la sesión ya quedó abierta y AuthContext se actualiza solo.
export async function accederConPin(cuenta, pin) {
  const { data, error } = await supabase.functions.invoke('cambiar-usuario', {
    body: { user_id: cuenta.user_id, secreto: cuenta.secreto, pin }
  })
  if (error) {
    const fallo = await leerError(error, 'No se pudo verificar el PIN. Intenta de nuevo.')
    // El servidor ya no reconoce este equipo: la entrada local no sirve más
    if (fallo.codigo === 'desconocido') quitarCuenta(cuenta.user_id)
    return fallo
  }
  const { error: errSesion } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' })
  if (errSesion) return { error: 'No se pudo abrir la sesión. Intenta de nuevo.' }
  return {}
}
