import { supabase } from './supabase'
import { leerError } from './cuentas'

// Autorización de subgerentes para editar el stock. Todo se verifica en el servidor
// (función `autorizar-stock`): la clave nunca se guarda ni se compara en el navegador.
const llamar = (cuerpo) => supabase.functions.invoke('autorizar-stock', { body: cuerpo })

// Administrador: subgerentes activos que ya tienen clave (para elegir quién autoriza)
export async function listarSubgerentes() {
  const { data, error } = await llamar({ accion: 'lista' })
  if (error) return { error: (await leerError(error, 'No se pudo cargar la lista de subgerentes.')).error, subgerentes: [] }
  return { subgerentes: data?.subgerentes ?? [] }
}

// Administrador: registra un movimiento de inventario con la clave de un subgerente
export async function registrarMovimientoAutorizado({ subgerenteId, clave, tipoPlanchaId, tipo, cantidad, motivo, referencia }) {
  const { error } = await llamar({
    accion: 'movimiento', subgerente_id: subgerenteId, clave,
    tipo_plancha_id: tipoPlanchaId, tipo, cantidad, motivo, referencia,
  })
  return error ? leerError(error, 'No se pudo registrar el movimiento. Intenta de nuevo.') : {}
}

// Subgerente: ¿ya creó su clave?
export async function consultarClave() {
  const { data, error } = await llamar({ accion: 'estado' })
  return error ? { tiene: null } : { tiene: !!data?.tiene_clave }
}

// Subgerente: crea o cambia SU clave (si ya tiene, hay que dar la actual)
export async function definirClave({ clave, claveActual }) {
  const { error } = await llamar({ accion: 'definir', clave, clave_actual: claveActual })
  return error ? leerError(error, 'No se pudo guardar la clave. Intenta de nuevo.') : {}
}

// Subgerente: todas las cuentas de subgerente (con su estado y si ya tienen clave)
export async function listarCuentasSubgerente() {
  const { data, error } = await llamar({ accion: 'lista_subgerentes' })
  if (error) return { error: (await leerError(error, 'No se pudo cargar la lista de subgerentes.')).error, subgerentes: [] }
  return { subgerentes: data?.subgerentes ?? [] }
}

// Subgerente: activa o desactiva la cuenta de otro subgerente
export async function cambiarEstadoSubgerente(userId, activo) {
  const { error } = await llamar({ accion: 'estado_subgerente', user_id: userId, activo })
  return error ? leerError(error, 'No se pudo cambiar el estado de la cuenta.') : {}
}

// Administrador: borra la clave de un subgerente (por ejemplo si la olvidó)
export async function restablecerClave(userId) {
  const { error } = await llamar({ accion: 'restablecer', user_id: userId })
  return error ? leerError(error, 'No se pudo restablecer la clave.') : {}
}
