import { useEffect, useRef, useState } from 'react'

const sinMovimiento = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Muestra un número entero contando desde el valor anterior (o desde 0 la primera vez).
// Cualquier otro valor (texto, decimales) se muestra tal cual, y con "reducir movimiento" no hay animación.
export default function NumeroAnimado({ valor, duracion = 500, formato }) {
  const animable = Number.isInteger(valor) && !sinMovimiento()
  const [actual, setActual] = useState(animable ? 0 : valor)
  const origen = useRef(0)

  useEffect(() => {
    if (!animable) return undefined
    const inicio = performance.now()
    const desde = origen.current
    let cuadro
    const paso = (ahora) => {
      const avance = Math.min(1, (ahora - inicio) / duracion)
      const suave = 1 - Math.pow(1 - avance, 3)
      const v = Math.round(desde + (valor - desde) * suave)
      origen.current = v
      setActual(v)
      if (avance < 1) cuadro = requestAnimationFrame(paso)
    }
    cuadro = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadro)
  }, [valor, animable, duracion])

  const mostrar = animable ? actual : valor
  return <>{formato && Number.isFinite(mostrar) ? formato(mostrar) : mostrar}</>
}
