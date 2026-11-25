import { useEffect, useRef, useState } from 'react'
import { registrar } from '../lib/revelar'

// Una sección que entra desde el costado al llegar a la vista (y otra vez, más rápido, al volver a verla).
// `lado`: de dónde viene ('izq' o 'der'). El resto de las propiedades son las de un div normal.
export default function Revelar({ lado = 'izq', className, style, children }) {
  const ref = useRef(null)
  useEffect(() => { registrar(ref.current, lado) }, [lado])
  return <div ref={ref} className={className} style={style}>{children}</div>
}

// Muestra su contenido (por ejemplo un gráfico) solo cuando llega a la pantalla, para que su animación de dibujo
// se vea al llegar y no cuando la sección aún está fuera de vista. Una vez dibujado se queda, sin repetirse.
// Reserva el alto para no mover la página.
export function SoloVisible({ alto, children }) {
  const ref = useRef(null)
  const [visto, setVisto] = useState(() =>
    typeof IntersectionObserver === 'undefined' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const el = ref.current
    if (visto || !el) return undefined
    const observador = new IntersectionObserver(([entrada]) => {
      if (entrada.isIntersecting) { setVisto(true); observador.disconnect() }
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' })
    observador.observe(el)
    return () => observador.disconnect()
  }, [visto])

  return <div ref={ref} style={{ minHeight: alto }}>{visto ? children : null}</div>
}
