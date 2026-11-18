import { assertEquals } from 'jsr:@std/assert@1'
import { puedeCrearRol } from './_shared/permisos.ts'

Deno.test('Administrador: crea cualquier rol menos subgerente cuando ya existe alguno', () => {
  for (const rol of ['administrador', 'vendedor', 'solo_lectura']) assertEquals(puedeCrearRol('administrador', true, rol, true).ok, true, rol)
  assertEquals(puedeCrearRol('administrador', true, 'subgerente', false).ok, true) // la primera cuenta
  assertEquals(puedeCrearRol('administrador', true, 'subgerente', true).ok, false) // ya no
})

Deno.test('Subgerente: solo crea cuentas de subgerente', () => {
  assertEquals(puedeCrearRol('subgerente', true, 'subgerente', true).ok, true)
  for (const rol of ['administrador', 'vendedor', 'solo_lectura']) assertEquals(puedeCrearRol('subgerente', true, rol, true).ok, false, rol)
})

Deno.test('Otros roles, cuentas inactivas y roles inventados no pueden', () => {
  assertEquals(puedeCrearRol('vendedor', true, 'vendedor', true).ok, false)
  assertEquals(puedeCrearRol('solo_lectura', true, 'vendedor', true).ok, false)
  assertEquals(puedeCrearRol(null, undefined, 'vendedor', false).ok, false)
  assertEquals(puedeCrearRol('administrador', false, 'vendedor', false).ok, false)
  assertEquals(puedeCrearRol('subgerente', false, 'subgerente', true).ok, false)
  assertEquals(puedeCrearRol('administrador', true, 'jefe', false).ok, false)
})
