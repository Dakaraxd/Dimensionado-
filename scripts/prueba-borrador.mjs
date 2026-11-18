// Pruebas del borrador de la orden (con un localStorage de mentira) y de la hora de Chile.
const mem = new Map()
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k),
}
// Object.keys(localStorage) debe listar las claves, como en el navegador
const ls = new Proxy(globalThis.localStorage, { ownKeys: () => [...mem.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) })
globalThis.localStorage = ls

const { leerBorrador, guardarBorrador, borrarBorrador, borrarTodosLosBorradores } = await import('../src/lib/borrador.js')
const { horaChile, horaMinutosChile, hoyChile } = await import('../src/lib/fechas.js')

let ok = 0, mal = 0
const prueba = (n, c) => { if (c) { ok++; console.log('  ✓', n) } else { mal++; console.log('  ✗ FALLÓ:', n) } }

const datos = { paso: 'cortes', cliente: { nombre: 'Ana', rut: '1-9' }, borradorPiezas: [{ cantidad: '2', largo: '40', ancho: '20', nombre: '' }] }
prueba('sin borrador → null', leerBorrador('u1') === null)
guardarBorrador('u1', datos)
prueba('guardar y leer devuelve lo mismo', JSON.stringify(leerBorrador('u1')) === JSON.stringify(datos))
prueba('cada usuario tiene el suyo', leerBorrador('u2') === null)
guardarBorrador('u2', { paso: 'plancha' })
prueba('el de u1 no se pisa', leerBorrador('u1').paso === 'cortes' && leerBorrador('u2').paso === 'plancha')
borrarBorrador('u1')
prueba('borrar quita solo el de ese usuario', leerBorrador('u1') === null && leerBorrador('u2') !== null)
// borrador de otro día se ignora y se limpia
mem.set('dimensionado.borrador.venta.u3', JSON.stringify({ dia: '2020-01-01', datos: { paso: 'cliente' } }))
prueba('borrador de otro día no se recupera', leerBorrador('u3') === null && !mem.has('dimensionado.borrador.venta.u3'))
mem.set('dimensionado.borrador.venta.u4', '{esto no es json')
prueba('contenido dañado no rompe (null)', leerBorrador('u4') === null)
prueba('sin usuario no hace nada', leerBorrador(undefined) === null && (guardarBorrador(undefined, {}), true))
mem.set('otra.cosa', 'x')
borrarTodosLosBorradores()
prueba('cerrar sesión borra todos los borradores', leerBorrador('u2') === null && mem.get('otra.cosa') === 'x')
// localStorage que falla
globalThis.localStorage = { getItem() { throw new Error('bloqueado') }, setItem() { throw new Error('lleno') }, removeItem() { throw new Error('x') } }
let sinError = true
try { guardarBorrador('u1', datos); leerBorrador('u1'); borrarBorrador('u1'); borrarTodosLosBorradores() } catch { sinError = false }
prueba('si el navegador bloquea el almacenamiento, no se rompe', sinError)

// Hora de Chile
const utc = (iso) => new Date(iso)
prueba('15:00 UTC en enero (verano, UTC-3) = 12 en Chile', horaChile(utc('2027-01-15T15:00:00Z')) === 12)
prueba('15:00 UTC en julio (invierno, UTC-4) = 11 en Chile', horaChile(utc('2027-07-15T15:00:00Z')) === 11)
prueba('03:00 UTC en enero = 0 (medianoche, no 24)', horaChile(utc('2027-01-15T03:00:00Z')) === 0)
prueba('formato de hora y minutos', horaMinutosChile(utc('2027-01-15T18:42:00Z')) === '15:42')
prueba('hoyChile tiene formato AAAA-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(hoyChile()))

console.log(`\nResultado: ${ok} correctas, ${mal} fallidas`)
process.exit(mal ? 1 : 0)
