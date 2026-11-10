import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import MovimientoModal from '../components/MovimientoModal'
import MovimientosInventario from '../components/MovimientosInventario'

const chip = (activo) => ({
  padding: '7px 16px', borderRadius: '99px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
  border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
  background: activo ? 'var(--primary)' : 'var(--bg2)',
  color: activo ? '#fff' : 'var(--text2)'
})

const botonMini = (color) => ({
  flex: 1, background: 'transparent', border: `1px solid ${color}`, color,
  borderRadius: '6px', padding: '5px 6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
})

export default function Stock() {
  const { profile } = useAuth()
  const [stocks, setStocks] = useState([])
  const [tipos, setTipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState('stock')
  const [modal, setModal] = useState(null) // null | { tipo?, tipo_plancha_id? }
  const [recarga, setRecarga] = useState(0)

  const esAdmin = profile?.rol === 'administrador'

  async function cargar() {
    const [st, ti] = await Promise.all([
      supabase.from('vista_stock_general').select('*').order('plancha_categoria').order('plancha_nombre'),
      supabase.from('tipos_plancha').select('*').eq('activo', true).order('nombre'),
    ])
    if (st.error) setError('No se pudo cargar el stock')
    setStocks(st.data ?? [])
    setTipos(ti.data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [])

  const disponibleColor = (disponible, total) => {
    if (total === 0) return 'var(--text3)'
    const pct = disponible / total
    if (pct > 0.5) return 'var(--green)'
    if (pct > 0.2) return 'var(--amber)'
    return 'var(--red)'
  }

  const sinStock = tipos.filter(t => !stocks.find(s => s.tipo_plancha_id === t.id) && t.categoria !== 'Servicios')

  const q = busqueda.toLowerCase()
  const stocksFiltrados = q
    ? stocks.filter(s =>
        s.plancha_nombre.toLowerCase().includes(q) ||
        (s.plancha_categoria ?? '').toLowerCase().includes(q) ||
        (s.plancha_medida ?? '').toLowerCase().includes(q))
    : stocks

  const totalDisponible = stocks.reduce((sum, s) => sum + s.disponible, 0)
  const totalVendido = stocks.reduce((sum, s) => sum + s.vendido, 0)

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px' }}>Stock de planchas</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{stocks.length} tipos · {totalDisponible} disponibles · {totalVendido} vendidas</p>
        </div>
        {esAdmin && (
          <button onClick={() => setModal({})}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500' }}>
            + Registrar movimiento
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        <button style={chip(vista === 'stock')} onClick={() => setVista('stock')}>Stock actual</button>
        <button style={chip(vista === 'movimientos')} onClick={() => setVista('movimientos')}>Movimientos</button>
      </div>

      {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px' }}>{error}</p>}

      {vista === 'movimientos' ? (
        <MovimientosInventario recarga={recarga} />
      ) : (
        <>
          <div style={{ marginBottom: '16px' }}>
            <input type="text" placeholder="🔍 Buscar plancha..." value={busqueda}
              onChange={e => setBusqueda(e.target.value)} style={{ maxWidth: '320px' }} />
          </div>

          {loading ? (
            <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando stock...</p>
          ) : stocks.length === 0 ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text3)' }}>No hay stock registrado.</p>
              {esAdmin && <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>Usa “Registrar movimiento” → Ingreso para comenzar.</p>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px' }}>
              {stocksFiltrados.map(s => (
                <div key={s.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '2px' }}>{s.plancha_categoria}</p>
                      <h3 style={{ fontSize: '15px', fontWeight: '500', marginBottom: '2px' }}>{s.plancha_nombre}</h3>
                      <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{s.plancha_medida}</p>
                    </div>
                    <span style={{ fontSize: '28px', fontWeight: '500', color: disponibleColor(s.disponible, s.total) }}>{s.disponible}</span>
                  </div>

                  <div style={{ background: 'var(--bg3)', borderRadius: '99px', height: '4px', marginBottom: '10px' }}>
                    <div style={{
                      height: '4px', borderRadius: '99px', background: disponibleColor(s.disponible, s.total),
                      width: `${s.total > 0 ? Math.min(100, Math.max(0, (s.disponible / s.total) * 100)) : 0}%`, transition: 'width 0.3s'
                    }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text3)' }}>
                    <span>Vendidas: <span style={{ color: 'var(--text2)' }}>{s.vendido}</span></span>
                    <span>Total: <span style={{ color: 'var(--text2)' }}>{s.total}</span></span>
                  </div>

                  {esAdmin && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                      <button style={botonMini('var(--green)')} onClick={() => setModal({ tipo: 'ingreso', tipo_plancha_id: s.tipo_plancha_id })}>📥 Ingreso</button>
                      <button style={botonMini('var(--red)')} onClick={() => setModal({ tipo: 'merma', tipo_plancha_id: s.tipo_plancha_id })}>🗑️ Merma</button>
                      <button style={botonMini('var(--amber)')} onClick={() => setModal({ tipo: 'ajuste', tipo_plancha_id: s.tipo_plancha_id })}>⚖️ Ajustar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modal && esAdmin && (
        <MovimientoModal
          stocks={stocks}
          sinStock={sinStock}
          inicial={modal}
          onCerrar={() => setModal(null)}
          onGuardado={() => { cargar(); setRecarga(r => r + 1) }}
        />
      )}
    </div>
  )
}
