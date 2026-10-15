// Lógica de PIN compartida por las funciones `pin-dispositivo` y `cambiar-usuario`.
// Solo usa APIs estándar (WebCrypto), así que también corre en Node/Deno para probarla.

export const MAX_INTENTOS = 5          // fallos seguidos antes de bloquear
export const BLOQUEO_MINUTOS = 15      // duración del bloqueo
export const MAX_INTENTOS_TOTAL = 10   // fallos seguidos tras los cuales el equipo se desactiva
export const MAX_EQUIPOS_POR_USUARIO = 10

const enc = new TextEncoder()
const PBKDF2_ITERACIONES = 120_000

export function aBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function aleatorio(bytes: number): string {
  return aBase64Url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export const generarSecreto = () => aleatorio(32)
export const generarSal = () => aleatorio(16)

export async function sha256Hex(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(texto))
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPin(pin: string, sal: string): Promise<string> {
  const clave = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(sal), iterations: PBKDF2_ITERACIONES },
    clave,
    256
  )
  return aBase64Url(new Uint8Array(bits))
}

// Comparación sin cortocircuito para no filtrar información por tiempos de respuesta
export function igualesConstante(a: string, b: string): boolean {
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  const n = Math.max(x.length, y.length)
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

// PIN de 4 a 6 dígitos que no sea evidente (0000, 1234, 4321...)
export function pinValido(pin: unknown): pin is string {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) return false
  if (/^(\d)\1+$/.test(pin)) return false
  const d = [...pin].map(Number)
  const sube = d.every((v, i) => i === 0 || v === d[i - 1] + 1)
  const baja = d.every((v, i) => i === 0 || v === d[i - 1] - 1)
  return !(sube || baja)
}

export interface EstadoDispositivo {
  intentos: number
  bloqueado_hasta: string | null
  activo: boolean
}

export type Decision =
  | { estado: 'ok'; cambios: { intentos: number; bloqueado_hasta: null; ultimo_uso: string } }
  | { estado: 'pin_incorrecto'; restantes: number; cambios: { intentos: number; bloqueado_hasta: string | null; activo: boolean } }
  | { estado: 'bloqueado'; minutos: number; cambios: null }
  | { estado: 'desactivado'; cambios: null }

// Decide qué hacer con un intento de PIN. Es una función pura para poder probarla.
export function evaluarIntento(d: EstadoDispositivo, ahora: Date, pinCorrecto: boolean): Decision {
  if (!d.activo) return { estado: 'desactivado', cambios: null }

  if (d.bloqueado_hasta && new Date(d.bloqueado_hasta) > ahora) {
    const minutos = Math.max(1, Math.ceil((new Date(d.bloqueado_hasta).getTime() - ahora.getTime()) / 60000))
    return { estado: 'bloqueado', minutos, cambios: null }
  }

  if (pinCorrecto) {
    return { estado: 'ok', cambios: { intentos: 0, bloqueado_hasta: null, ultimo_uso: ahora.toISOString() } }
  }

  const intentos = d.intentos + 1
  const desactivar = intentos >= MAX_INTENTOS_TOTAL
  const bloquear = !desactivar && intentos % MAX_INTENTOS === 0
  return {
    estado: 'pin_incorrecto',
    restantes: bloquear || desactivar ? 0 : MAX_INTENTOS - (intentos % MAX_INTENTOS),
    cambios: {
      intentos,
      bloqueado_hasta: bloquear ? new Date(ahora.getTime() + BLOQUEO_MINUTOS * 60000).toISOString() : null,
      activo: !desactivar
    }
  }
}
