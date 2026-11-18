// Supabase devuelve como máximo 1.000 filas por consulta. Para los reportes de períodos largos
// hay que pedir varias páginas y juntarlas; si no, las ventas de más se perderían sin avisar.
//
// `consulta(desde, hasta)` debe devolver la consulta con `.range(desde, hasta)` ya aplicado y con un
// orden estable (agrega un campo único, como `id`, al final del `order`), para que ninguna fila se
// repita ni se salte entre una página y otra.
export const TAMANO_PAGINA = 1000
const MAX_PAGINAS = 200 // tope de seguridad: 200.000 filas

export async function traerTodo(consulta, tamano = TAMANO_PAGINA) {
  const filas = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const desde = pagina * tamano
    const { data, error } = await consulta(desde, desde + tamano - 1)
    if (error) return { data: null, error }
    filas.push(...(data ?? []))
    if (!data || data.length < tamano) return { data: filas, error: null }
  }
  return { data: filas, error: { message: 'Se superó el máximo de filas que se puede cargar' } }
}
