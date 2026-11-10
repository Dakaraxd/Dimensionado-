import { useState } from 'react'
import HistorialVentas from './HistorialVentas'
import Dimensionador from './Dimensionador'

const TABS = [
  { key: 'ventas', icon: '📋', label: 'Historial de ventas' },
  { key: 'dimensionado', icon: '✂️', label: 'Historial de dimensionado' },
]

// Un solo módulo para consultar lo ocurrido: ventas y trabajo de dimensionado.
export default function Reportes({ tabInicial = 'ventas', onNuevaOrden }) {
  const [tab, setTab] = useState(tabInicial)

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Reportes</h2>
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Consulta las ventas y el trabajo de dimensionado</p>
      </div>

      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '20px', overflowX: 'auto' }}>
        {TABS.map(t => {
          const activa = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '10px 16px', background: 'transparent', border: 'none', whiteSpace: 'nowrap',
                borderBottom: `3px solid ${activa ? 'var(--primary)' : 'transparent'}`, marginBottom: '-1px',
                color: activa ? 'var(--primary)' : 'var(--text2)', fontSize: '14px', fontWeight: activa ? 600 : 500
              }}>
              {t.icon} {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'ventas' ? <HistorialVentas /> : <Dimensionador onNuevaVenta={onNuevaOrden} />}
    </div>
  )
}
