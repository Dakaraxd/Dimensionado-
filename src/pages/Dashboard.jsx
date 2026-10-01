import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import Usuarios from './Usuarios'
import Stock from './Stock'
import Planchas from './Planchas'
import Ordenes from './Ordenes'
import Historial from './Historial'
import Tablero from './Tablero'
import Logs from './Logs'
import Dimensionador from './Dimensionador'
import PanelVentas from './PanelVentas'

export default function Dashboard() {
  const { profile, signOut } = useAuth()
  const [pagina, setPagina] = useState('stock')
  const [prefillDimensionador, setPrefillDimensionador] = useState(null)

  const esAdmin = profile?.rol === 'administrador'

  function irADimensionador(datos) {
    setPrefillDimensionador(datos)
    setPagina('dimensionador')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Navbar */}
      <nav style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div>
          <h1 style={{ fontSize: '15px', fontWeight: '500', color: 'var(--text1)' }}>Dimensionado</h1>
          <p style={{ fontSize: '11px', color: 'var(--text3)' }}>Home Center</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text1)' }}>{profile?.nombre}</p>
            <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'capitalize' }}>{profile?.rol?.replace('_', ' ')}</p>
          </div>
          <button onClick={signOut}
            style={{ background: 'transparent', border: 'none', color: 'var(--red)', fontSize: '13px', cursor: 'pointer' }}>
            Salir
          </button>
        </div>
      </nav>

      {/* Menú */}
      <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '8px 16px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: '4px', minWidth: 'max-content' }}>
          {[
            { key: 'stock', label: '📦 Stock' },
            { key: 'ordenes', label: '🕐 Órdenes' },
            { key: 'tablero', label: '📅 Tablero' },
            { key: 'historial', label: '📋 Historial' },
            { key: 'dimensionador', label: '✂️ Dimensionador' },
            ...(esAdmin ? [{ key: 'panel', label: '📊 Panel de ventas' }] : []),
            ...(esAdmin ? [{ key: 'planchas', label: '🪵 Planchas' }] : []),
            ...(esAdmin ? [{ key: 'usuarios', label: '👥 Usuarios' }] : []),
            ...(esAdmin ? [{ key: 'logs', label: '🔍 Actividad' }] : []),
          ].map(m => (
            <button key={m.key} onClick={() => setPagina(m.key)}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                background: pagina === m.key ? 'var(--blue)' : 'transparent',
                color: pagina === m.key ? '#fff' : 'var(--text2)'
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
        {pagina === 'stock' && <Stock />}
        {pagina === 'ordenes' && <Ordenes onCortar={irADimensionador} />}
        {pagina === 'tablero' && <Tablero />}
        {pagina === 'historial' && <Historial />}
        {pagina === 'dimensionador' && (
          <Dimensionador prefill={prefillDimensionador} onPrefillConsumido={() => setPrefillDimensionador(null)} />
        )}
        {pagina === 'panel' && esAdmin && <PanelVentas />}
        {pagina === 'planchas' && esAdmin && <Planchas />}
        {pagina === 'usuarios' && esAdmin && <Usuarios />}
        {pagina === 'logs' && esAdmin && <Logs />}
      </main>
    </div>
  )
}