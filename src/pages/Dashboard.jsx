import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { cuentaDe } from '../lib/cuentas'
import CambiarUsuario from '../components/CambiarUsuario'
import { ConfigurarPin } from '../components/CuentasRapidas'
import Inicio from './Inicio'
import Usuarios from './Usuarios'
import Stock from './Stock'
import Planchas from './Planchas'
import Ordenes from './Ordenes'
import Historial from './Historial'
import Tablero from './Tablero'
import Logs from './Logs'
import Dimensionador from './Dimensionador'
import NuevaVenta from './NuevaVenta'

// Los módulos se agrupan siguiendo el flujo de venta: stock → orden → dimensionado.
const GRUPOS = [
  { titulo: null, items: [{ key: 'inicio', icon: '🏠', label: 'Inicio' }] },
  {
    titulo: 'Venta',
    items: [
      { key: 'venta', icon: '🛒', label: 'Nueva venta', soloOperar: true },
      { key: 'stock', icon: '📦', label: 'Stock' },
      { key: 'ordenes', icon: '🕐', label: 'Órdenes' },
      { key: 'dimensionador', icon: '✂️', label: 'Dimensionador' },
    ],
  },
  {
    titulo: 'Seguimiento',
    items: [
      { key: 'tablero', icon: '📅', label: 'Tablero' },
      { key: 'historial', icon: '📋', label: 'Historial' },
    ],
  },
  {
    titulo: 'Administración',
    soloAdmin: true,
    items: [
      { key: 'planchas', icon: '🟫', label: 'Planchas' },
      { key: 'usuarios', icon: '👥', label: 'Usuarios' },
      { key: 'logs', icon: '🔍', label: 'Actividad' },
    ],
  },
]

export default function Dashboard() {
  const { user, profile, signOut } = useAuth()
  const [pagina, setPagina] = useState('inicio')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [pinAbierto, setPinAbierto] = useState(false)
  const [, refrescar] = useState(0)
  const [invitacionOculta, setInvitacionOculta] = useState(() => sessionStorage.getItem('dimensionado.pin.omitido') === '1')

  const usuario = { id: user?.id, nombre: profile?.nombre ?? user?.email, email: profile?.email ?? user?.email }
  const tienePin = !!user && !!cuentaDe(user.id)

  const esAdmin = profile?.rol === 'administrador'
  const puedeOperar = esAdmin || profile?.rol === 'vendedor'
  const grupos = GRUPOS
    .filter(g => !g.soloAdmin || esAdmin)
    .map(g => ({ ...g, items: g.items.filter(i => !i.soloOperar || puedeOperar) }))
  const itemActual = grupos.flatMap(g => g.items).find(i => i.key === pagina)

  function navegar(key) {
    setPagina(key)
    setMenuAbierto(false)
  }

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop${menuAbierto ? ' visible' : ''}`} onClick={() => setMenuAbierto(false)} />

      <aside className={`sidebar${menuAbierto ? ' abierta' : ''}`}>
        <div className="sidebar-brand">
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px', background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0
          }}><span style={{ color: '#fff', fontWeight: 800, fontSize: '20px' }}>D</span></div>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text1)', lineHeight: 1.2 }}>Dimensionado</h1>
            <p style={{ fontSize: '11px', color: 'var(--text3)' }}>Home Center</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {grupos.map((g, gi) => (
            <div key={gi}>
              {g.titulo && <p className="nav-group-title">{g.titulo}</p>}
              {g.items.map(m => (
                <button key={m.key} className={`nav-item${pagina === m.key ? ' activo' : ''}`} onClick={() => navegar(m.key)}>
                  <span style={{ fontSize: '17px', width: '22px', textAlign: 'center' }}>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text1)' }}>{profile?.nombre}</p>
          <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'capitalize', marginBottom: '8px' }}>
            {profile?.rol?.replace('_', ' ')}
          </p>
          <button onClick={() => setSelectorAbierto(true)}
            style={{
              width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text1)',
              borderRadius: '8px', padding: '7px', fontSize: '13px', fontWeight: '500', marginBottom: '6px'
            }}>
            ⇄ Cambiar de usuario
          </button>
          <button onClick={() => setPinAbierto(true)}
            style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text3)', padding: '4px', fontSize: '12px', marginBottom: '4px' }}>
            🔐 {tienePin ? 'Cambiar mi PIN' : 'Crear mi PIN'}
          </button>
          <button onClick={signOut}
            style={{
              width: '100%', background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)',
              borderRadius: '8px', padding: '7px', fontSize: '13px', fontWeight: '500'
            }}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="main-col">
        <div className="topbar-mobile">
          <button onClick={() => setMenuAbierto(true)} aria-label="Abrir menú"
            style={{ background: 'var(--bg3)', border: 'none', borderRadius: '8px', width: '38px', height: '38px', fontSize: '20px', color: 'var(--text1)' }}>
            ☰
          </button>
          <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text1)' }}>
            {itemActual ? `${itemActual.icon} ${itemActual.label}` : 'Dimensionado'}
          </p>
        </div>

        <main className="main-content">
          {!tienePin && !invitacionOculta && user && (
            <div style={{ background: 'var(--primary-soft)', border: '1px solid rgba(242,107,29,0.3)', borderRadius: '12px', padding: '12px 16px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <p style={{ flex: 1, minWidth: '200px', fontSize: '13px', color: 'var(--text1)' }}>
                🔐 <strong>Acceso rápido:</strong> crea un PIN para cambiar de usuario en este equipo sin escribir tu contraseña.
              </p>
              <button onClick={() => setPinAbierto(true)}
                style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: 600 }}>Crear PIN</button>
              <button onClick={() => { sessionStorage.setItem('dimensionado.pin.omitido', '1'); setInvitacionOculta(true) }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '12px' }}>Ahora no</button>
            </div>
          )}
          {pagina === 'inicio' && <Inicio onNavegar={navegar} />}
          {pagina === 'venta' && puedeOperar && <NuevaVenta onNavegar={navegar} />}
          {pagina === 'stock' && <Stock />}
          {pagina === 'ordenes' && <Ordenes onNuevaVenta={() => navegar('venta')} />}
          {pagina === 'dimensionador' && <Dimensionador onNuevaVenta={() => navegar('venta')} />}
          {pagina === 'tablero' && <Tablero />}
          {pagina === 'historial' && <Historial />}
          {pagina === 'planchas' && esAdmin && <Planchas />}
          {pagina === 'usuarios' && esAdmin && <Usuarios />}
          {pagina === 'logs' && esAdmin && <Logs />}
        </main>
      </div>

      {selectorAbierto && (
        <CambiarUsuario usuario={usuario}
          onCerrar={() => setSelectorAbierto(false)}
          onAgregarOtra={() => { setSelectorAbierto(false); signOut() }}
          onConfigurarPin={() => { setSelectorAbierto(false); setPinAbierto(true) }} />
      )}
      {pinAbierto && <ConfigurarPin usuario={usuario} onCerrar={() => setPinAbierto(false)} onListo={() => refrescar(n => n + 1)} />}
    </div>
  )
}
