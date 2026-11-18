import { useState, useEffect } from 'react'

// Pantalla de espera mientras el optimizador calcula los cortes: una sierra circular
// recorre una plancha dejando su línea de corte y soltando aserrín.
// Los estilos (.sierra-*, .calculando-*) están en index.css y se apagan con "reducir movimiento".

const FRASES = [
  'Afilando la sierra…',
  'Midiendo dos veces, cortando una…',
  'Buscando el mejor aprovechamiento…',
  'Acomodando cada pieza en la plancha…',
  'Cuidando cada centímetro…',
  'Que no se desperdicie ni un retazo…',
]

// Hoja de sierra: un círculo con dientes en forma de triángulo
const DIENTES = 14
const RUTA_HOJA = (() => {
  const puntos = []
  for (let i = 0; i < DIENTES * 2; i++) {
    const ang = (Math.PI * 2 * i) / (DIENTES * 2)
    const radio = i % 2 === 0 ? 23 : 17.5
    puntos.push(`${(Math.cos(ang) * radio).toFixed(1)},${(Math.sin(ang) * radio).toFixed(1)}`)
  }
  return `M${puntos.join('L')}Z`
})()

export default function CalculandoCortes() {
  const [frase, setFrase] = useState(() => Math.floor(Math.random() * FRASES.length))

  // Si el cálculo tarda más de lo normal, la frase cambia para que se note que sigue trabajando
  useEffect(() => {
    const t = setInterval(() => setFrase(n => (n + 1) % FRASES.length), 1700)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="calculando-fondo" role="status" aria-live="polite">
      <div className="calculando-caja">
        <div className="sierra-escena" aria-hidden="true">
          <div className="sierra-tabla" />
          <div className="sierra-linea" />
          <div className="sierra-carro">
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <span key={i} className="sierra-aserrin" style={{ '--retraso': `${i * 0.07}s`, '--desvio': `${(i % 2 ? 1 : -1) * (4 + i * 3)}px` }} />
            ))}
            <svg className="sierra-hoja" viewBox="-24 -24 48 48" width="48" height="48">
              <path d={RUTA_HOJA} fill="#aab3bd" stroke="#5b6470" strokeWidth="1.2" strokeLinejoin="round" />
              <circle r="9" fill="#d5dbe2" stroke="#5b6470" strokeWidth="1" />
              <circle r="2.6" fill="#5b6470" />
              <line x1="-9" y1="0" x2="9" y2="0" stroke="#5b6470" strokeWidth="1" />
            </svg>
          </div>
        </div>
        <p className="calculando-titulo">Calculando los cortes…</p>
        <p className="calculando-frase">{FRASES[frase]}</p>
      </div>
    </div>
  )
}
