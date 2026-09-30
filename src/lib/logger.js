import { supabase } from './supabase'

// `perfil` (opcional): el profile ya cargado en el contexto de auth.
// Pasarlo evita una consulta extra a `profiles` por cada log.
// NOTA: este registro es de apoyo para la UI. La auditoría confiable debe
// generarse con triggers en la base de datos (ver supabase/triggers.sql).
export async function registrarLog({ accion, entidad, detalle = {} }, perfil = null) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  let nombre = perfil?.nombre
  if (!nombre) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('nombre')
      .eq('id', user.id)
      .single()
    nombre = profile?.nombre
  }

  const { error } = await supabase.from('logs').insert({
    usuario_id: user.id,
    usuario_nombre: nombre ?? user.email,
    accion,
    entidad,
    detalle
  })
  if (error) console.error('No se pudo registrar el log:', error.message)
}