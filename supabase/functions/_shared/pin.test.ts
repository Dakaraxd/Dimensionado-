import { assertEquals, assert } from 'jsr:@std/assert@1'
import {
  pinValido, evaluarIntento, hashPin, generarSal, generarSecreto, sha256Hex, igualesConstante,
  MAX_INTENTOS, MAX_INTENTOS_TOTAL, BLOQUEO_MINUTOS,
} from './pin.ts'

const ahora = new Date('2026-10-14T12:00:00Z')
const nuevo = () => ({ intentos: 0, bloqueado_hasta: null as string | null, activo: true })

Deno.test('PIN válido: 4 a 6 dígitos y no evidente', () => {
  for (const ok of ['4827', '9031', '135790', '482716']) assert(pinValido(ok), ok)
  for (const mal of ['123', '1234567', 'abcd', '12a4', '', '0000', '1111', '1234', '4321', '123456', '654321', 1234, null, undefined]) {
    assert(!pinValido(mal as unknown), String(mal))
  }
})

Deno.test('PIN correcto reinicia contadores', () => {
  const d = evaluarIntento({ intentos: 3, bloqueado_hasta: null, activo: true }, ahora, true)
  assertEquals(d.estado, 'ok')
  if (d.estado === 'ok') { assertEquals(d.cambios.intentos, 0); assertEquals(d.cambios.bloqueado_hasta, null) }
})

Deno.test('4 fallos avisan cuántos quedan y el 5° bloquea 15 minutos', () => {
  let est = nuevo()
  for (let i = 1; i <= MAX_INTENTOS - 1; i++) {
    const d = evaluarIntento(est, ahora, false)
    assertEquals(d.estado, 'pin_incorrecto')
    if (d.estado !== 'pin_incorrecto') throw new Error()
    assertEquals(d.restantes, MAX_INTENTOS - i)
    assertEquals(d.cambios.bloqueado_hasta, null)
    est = { ...est, intentos: d.cambios.intentos }
  }
  const quinto = evaluarIntento(est, ahora, false)
  if (quinto.estado !== 'pin_incorrecto') throw new Error()
  assertEquals(quinto.restantes, 0)
  assertEquals(quinto.cambios.bloqueado_hasta, new Date(ahora.getTime() + BLOQUEO_MINUTOS * 60000).toISOString())
})

Deno.test('Bloqueado: rechaza incluso con PIN correcto y no cuenta intentos', () => {
  const bloqueado = { intentos: 5, bloqueado_hasta: new Date(ahora.getTime() + 10 * 60000).toISOString(), activo: true }
  for (const correcto of [true, false]) {
    const d = evaluarIntento(bloqueado, ahora, correcto)
    assertEquals(d.estado, 'bloqueado')
    if (d.estado === 'bloqueado') assertEquals(d.minutos, 10)
    assertEquals(d.cambios, null)
  }
})

Deno.test('Pasado el bloqueo se puede volver a intentar', () => {
  const vencido = { intentos: 5, bloqueado_hasta: new Date(ahora.getTime() - 1000).toISOString(), activo: true }
  assertEquals(evaluarIntento(vencido, ahora, true).estado, 'ok')
})

Deno.test('A los 10 fallos seguidos el equipo se desactiva', () => {
  const d = evaluarIntento({ intentos: MAX_INTENTOS_TOTAL - 1, bloqueado_hasta: null, activo: true }, ahora, false)
  if (d.estado !== 'pin_incorrecto') throw new Error()
  assertEquals(d.cambios.activo, false)
  assertEquals(evaluarIntento({ intentos: 10, bloqueado_hasta: null, activo: false }, ahora, true).estado, 'desactivado')
})

Deno.test('Hash del PIN: determinista con la misma sal, distinto con otra sal o PIN', async () => {
  const sal = generarSal()
  const a = await hashPin('4827', sal)
  assertEquals(a, await hashPin('4827', sal))
  assert(a !== await hashPin('4828', sal))
  assert(a !== await hashPin('4827', generarSal()))
  assert(!a.includes('4827'))
})

Deno.test('Secretos únicos y comparación constante', async () => {
  const s1 = generarSecreto(), s2 = generarSecreto()
  assert(s1 !== s2 && s1.length >= 40)
  assert(igualesConstante(await sha256Hex(s1), await sha256Hex(s1)))
  assert(!igualesConstante(await sha256Hex(s1), await sha256Hex(s2)))
  assert(!igualesConstante('abc', 'abcd'))
})
