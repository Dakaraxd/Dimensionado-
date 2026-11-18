// Quién puede crear cuentas de qué rol. Función pura para poder probarla.
//
// Regla de los subgerentes: el administrador solo puede crear la PRIMERA cuenta de subgerente
// (cuando aún no existe ninguna). Desde ese momento solo un subgerente activo puede crear las demás,
// y un subgerente no puede crear cuentas de otros roles.
export const ROLES_VALIDOS = ['administrador', 'vendedor', 'solo_lectura', 'subgerente']

export type Decision = { ok: true } | { ok: false; error: string }

export function puedeCrearRol(
  rolQuienCrea: string | null | undefined,
  activoQuienCrea: boolean | null | undefined,
  rolNuevo: string,
  yaHaySubgerentes: boolean,
): Decision {
  if (activoQuienCrea === false) return { ok: false, error: 'Tu cuenta no está activa.' }
  if (!ROLES_VALIDOS.includes(rolNuevo)) return { ok: false, error: 'Rol no válido.' }

  if (rolQuienCrea === 'administrador') {
    if (rolNuevo !== 'subgerente') return { ok: true }
    return yaHaySubgerentes
      ? { ok: false, error: 'Las cuentas de subgerente solo las puede crear un subgerente.' }
      : { ok: true }
  }
  if (rolQuienCrea === 'subgerente') {
    return rolNuevo === 'subgerente'
      ? { ok: true }
      : { ok: false, error: 'Un subgerente solo puede crear cuentas de subgerente.' }
  }
  return { ok: false, error: 'Solo administradores pueden crear usuarios' }
}
