// Efecto "revelar al hacer scroll": cada sección de una pantalla entra con un leve desplazamiento desde el costado
// cuando llega a la vista. La primera vez dura un poco más; al salir de la vista y volver a entrar (subir y volver
// a bajar) repite el efecto, pero más corto y rápido para no hacer perder tiempo.
// Todo se hace con clases CSS (ver index.css); con "reducir movimiento" no se activa nada.

const sinEfecto = () =>
  typeof window === 'undefined' || typeof IntersectionObserver === 'undefined' ||
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const estado = new WeakMap() // elemento → { mostrado, primera, auto, nivel }
const automaticos = new Set() // los registrados por el recorrido automático (se revisan si cambian de tamaño)
let observador = null

// Hay un diálogo o animación a pantalla completa dentro: nunca se oculta ni se anima desde afuera
const SELECTOR_PROHIBIDO = '.diagrama-wrap, [data-sin-revelar], .modal-fondo, .calculando-fondo'
const SELECTOR_DIALOGO = '.modal-fondo, .calculando-fondo, [role="dialog"], [role="alertdialog"]'

function crearObservador() {
  return new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const el = e.target
      const st = estado.get(el)
      if (!st) continue
      const visible = e.isIntersecting && (e.intersectionRatio >= 0.08 || e.intersectionRect.height >= 120)
      if (visible) {
        if (!el.classList.contains('visto')) {
          // Más rápido si ya se había mostrado antes o si ya estaba en pantalla al abrir la pantalla
          el.classList.toggle('rapido', st.mostrado || st.primera)
          el.classList.add('visto')
          st.mostrado = true
        }
      } else if (!e.isIntersecting && !el.querySelector(SELECTOR_DIALOGO)) {
        el.classList.remove('visto') // fuera de la vista: se prepara para entrar de nuevo
      }
      st.primera = false
    }
  }, { threshold: [0, 0.005, 0.02, 0.05, 0.08, 0.15, 0.3, 0.6, 1], rootMargin: '0px 0px -4% 0px' })
}

// Registra un elemento para que se revele. `lado`: de dónde viene ('izq' o 'der').
export function registrar(el, lado = 'izq', auto = false, nivel = 0) {
  if (!el || sinEfecto() || estado.has(el)) return
  observador ??= crearObservador()
  estado.set(el, { mostrado: false, primera: true, auto, nivel })
  if (auto) automaticos.add(el)
  el.classList.add('revela', 'revela-' + lado)
  observador.observe(el)
}

function desregistrar(el) {
  observador?.unobserve(el)
  estado.delete(el)
  automaticos.delete(el)
  el.classList.remove('revela', 'revela-izq', 'revela-der', 'visto', 'rapido')
}

const OMITIR_ETIQUETAS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'P', 'SPAN', 'A', 'H1', 'H2', 'H3', 'H4', 'SCRIPT', 'STYLE'])
const OMITIR_CLASES = ['modal-fondo', 'calculando-fondo', 'revela', 'entrada', 'rebote']
const ALTO_MIN = 56    // lo más pequeño (botones, filtros, títulos) no se anima: son opciones, no secciones
const ALTO_MAX = 5000  // lo gigante no se anima, para que nunca quede oculto con parte a la vista

function esSeccion(el, alto) {
  if (OMITIR_ETIQUETAS.has(el.tagName)) return false
  if (OMITIR_CLASES.some(c => el.classList.contains(c))) return false
  if (alto < ALTO_MIN || alto > ALTO_MAX) return false
  // Barras de filtros y buscadores: son opciones, no secciones
  if (alto < 160 && el.querySelector('input, select, textarea, button')) return false
  if (el.querySelector('.revela, ' + SELECTOR_PROHIBIDO) || el.matches('[data-sin-revelar]')) return false
  const pos = getComputedStyle(el).position
  return pos !== 'fixed' && pos !== 'sticky'
}

// Recorre la raíz de una pantalla: sus bloques se revelan; si un bloque es una lista larga (o muy alto),
// se revelan sus elementos uno por uno.
function escanear(raiz) {
  const visitar = (padre, nivel) => {
    Array.from(padre.children).forEach((c, i) => {
      if (!(c instanceof HTMLElement) || estado.has(c)) return
      const alto = c.getBoundingClientRect().height
      if (nivel < 2 && (c.children.length >= 6 || alto > 4000) && !OMITIR_CLASES.some(k => c.classList.contains(k))) {
        visitar(c, nivel + 1)
        return
      }
      if (esSeccion(c, alto)) registrar(c, i % 2 === 0 ? 'izq' : 'der', true, nivel)
    })
  }
  visitar(raiz, 0)
}

// Activa el efecto sobre el contenedor de pantallas; vigila los cambios (datos que llegan, otra pantalla).
export function activarRevelado(contenedor) {
  if (!contenedor || sinEfecto()) return () => {}
  // Un bloque registrado cuando aún cargaba puede haber crecido (llegó una lista larga): se desarma para
  // revelar sus elementos por separado
  const reevaluar = () => {
    for (const el of Array.from(automaticos)) {
      if (!el.isConnected) { automaticos.delete(el); continue }
      // Si ahora contiene un plano de cortes o una ventana emergente, deja de animarse (no debe poder ocultarse)
      if (el.querySelector(SELECTOR_PROHIBIDO)) { desregistrar(el); continue }
      const st = estado.get(el)
      if (st && st.nivel < 2 && (el.children.length >= 6 || el.getBoundingClientRect().height > 4000)) desregistrar(el)
    }
  }
  const revisar = () => { reevaluar(); Array.from(contenedor.children).forEach(escanear) }
  revisar()
  let pendiente = 0
  const vigilante = new MutationObserver(() => {
    if (pendiente) return
    pendiente = requestAnimationFrame(() => { pendiente = 0; revisar() })
  })
  vigilante.observe(contenedor, { childList: true, subtree: true })
  return () => { vigilante.disconnect(); if (pendiente) cancelAnimationFrame(pendiente) }
}
