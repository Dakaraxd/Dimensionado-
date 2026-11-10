import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import PanelVentas from './PanelVentas'

const ACCESOS = [
  { key: 'venta', icon: '🛒', label: 'Nueva orden', destacado: true, soloOperar: true },
  { key: 'stock', icon: '📦', label: 'Stock' },
  { key: 'ordenes', icon: '🕐', label: 'Registro de salida', conBadge: true },
  { key: 'tablero', icon: '📅', label: 'Planificador' },
  { key: 'reportes', icon: '📊', label: 'Reportes' },
]

const ACCESOS_ADMIN = [
  { key: 'planchas', icon: '🟫', label: 'Planchas' },
  { key: 'usuarios', icon: '👥', label: 'Usuarios' },
]

export default function Inicio({ onNavegar }) {
  const { profile } = useAuth()
  const [pendientes, setPendientes] = useState(0)
  const esAdmin = profile?.rol === 'administrador'
  const puedeOperar = esAdmin || profile?.rol === 'vendedor'
  const accesos = (esAdmin ? [...ACCESOS, ...ACCESOS_ADMIN] : ACCESOS).filter(a => !a.soloOperar || puedeOperar)
  const primerNombre = profile?.nombre?.split(' ')[0]

  useEffect(() => {
    supabase
      .from('ordenes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
      .then(({ count }) => setPendientes(count ?? 0))
  }, [])

  const accesosRapidos = (
    <div>
      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', marginBottom: '10px' }}>Accesos rápidos</p>
        <div className="quick-grid" >
          {accesos.map(a => (
            <button key={a.key} className={`quick-tile${a.destacado ? ' destacado' : ''}`} onClick={() => onNavegar(a.key)}>
              {a.conBadge && pendientes > 0 && <span className="quick-badge">{pendientes}</span>}
              <span className="quick-icon">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
    </div>
  )

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700' }}>Hola{primerNombre ? `, ${primerNombre}` : ''}</h2>
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>¿Qué quieres hacer?</p>
      </div>

      {esAdmin ? (
        <PanelVentas despuesDeTarjetas={accesosRapidos} />
      ) : accesosRapidos}
    </div>
  )
}
