import { useEffect, useRef, useState } from 'react'

const sinEfecto = () =>
  typeof window === 'undefined' || typeof IntersectionObserver === 'undefined' ||
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Devuelve [ref, visto]: `visto` pasa a true (y ya no vuelve a false) la primera vez que el elemento entra en pantalla.
// Si el navegador no puede observar, o la persona pidió "reducir movimiento", todo se muestra de inmediato.
function useVisto() {
  const ref = useRef(null)
  const [visto, setVisto] = useState(sinEfecto)

  useEffect(() => {
    const el = ref.current
    if (visto || !el) return undefined
    const observador = new IntersectionObserver(([entrada]) => {
      if (entrada.isIntersecting) { setVisto(true); observador.disconnect() }
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' })
    observador.observe(el)
    return () => observador.disconnect()
  }, [visto])

  return [ref, visto]
}

// Al bajar por la pantalla, la sección entra con un leve desplazamiento desde el costado y se desvanece al aparecer.
// `lado`: de dónde viene ('izq' o 'der'). El resto de las propiedades son las de un div normal.
export default function Revelar({ lado = 'izq', className = '', style, children }) {
  const [ref, visto] = useVisto()
  return (
    <div ref={ref} className={`revela revela-${lado}${visto ? ' visto' : ''} ${className}`.trim()} style={style}>
      {children}
    </div>
  )
}

// Muestra su contenido (por ejemplo un gráfico) solo cuando llega a la pantalla, para que su animación
// de dibujo se vea al llegar y no cuando la sección aún está fuera de vista. Reserva el alto para no mover la página.
export function SoloVisible({ alto, children }) {
  const [ref, visto] = useVisto()
  return <div ref={ref} style={{ minHeight: alto }}>{visto ? children : null}</div>
}
