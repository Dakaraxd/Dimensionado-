import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PanelVentas from './PanelVentas'

const ACCESOS = [
  { key: 'stock', icon: '📦', label: 'Stock' },
  { key: 'ordenes', icon: '🕐', label: 'Órdenes', conBadge: true },
  { key: 'dimensionador', icon: '✂️', label: 'Dimensionador' },
  { key: 'tablero', icon: '📅', label: 'Tablero' },
  { key: 'historial', icon: '📋', label: 'Historial' },
]

const ACCESOS_ADMIN = [
  { key: 'planchas', icon: '🪵', label: 'Planchas' },
  { key: 'usuarios', icon: '👥', label: 'Usuarios' },
]

export default function Inicio({ onNavegar }) {
  const { profile } = useAuth()
  const [pendientes, setPendientes] = useState(0)
  const esAdmin = profile?.rol === 'administrador'
  const accesos = esAdmin ? [...ACCESOS, ...ACCESOS_ADMIN] : ACCESOS
  const primerNombre = profile?.nombre?.split(' ')[0]

  useEffect(() => {
    supabase
      .from('ordenes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
      .then(({ count }) => setPendientes(count ?? 0))
  }, [])

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700' }}>Hola{primerNombre ? `, ${primerNombre}` : ''}</h2>
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>¿Qué quieres hacer?</p>
      </div>

      <div className="quick-grid" style={{ marginBottom: esAdmin ? '30px' : 0 }}>
        {accesos.map(a => (
          <button key={a.key} className="quick-tile" onClick={() => onNavegar(a.key)}>
            {a.conBadge && pendientes > 0 && <span className="quick-badge">{pendientes}</span>}
            <span className="quick-icon">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      {esAdmin && <PanelVentas />}
    </div>
  )
}
