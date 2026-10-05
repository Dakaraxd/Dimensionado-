import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { registrarLog } from '../lib/logger'
import { CATEGORIAS } from '../lib/constants'

export default function Stock() {
  const { profile } = useAuth()
  const [stocks, setStocks] = useState([])
  const [tipos, setTipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState({ tipo_plancha_id: '', total: '' })
  const [formEditar, setFormEditar] = useState({ total: '' })
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const esAdmin = profile?.rol === 'administrador'

  const categorias = CATEGORIAS

  useEffect(() => { fetchStock(); fetchTipos() }, [])

  async function fetchStock() {
    const { data } = await supabase
      .from('vista_stock_general')
      .select('*')
      .order('plancha_categoria')
      .order('plancha_nombre')
    setStocks(data ?? [])
    setLoading(false)
  }

  async function fetchTipos() {
    const { data } = await supabase
      .from('tipos_plancha')
      .select('*')
      .eq('activo', true)
      .order('nombre')
    setTipos(data ?? [])
  }

  async function handleAgregar(e) {
    e.preventDefault()
    setError('')
    setGuardando(true)

    const tipoSeleccionado = tipos.find(t => t.id === form.tipo_plancha_id)

    const { error } = await supabase.from('stock_general').insert({
      tipo_plancha_id: form.tipo_plancha_id,
      total: parseInt(form.total),
      actualizado_por: profile.id
    })

    if (error) {
      if (error.code === '23505') setError('Ya existe stock para ese tipo de plancha')
      else setError('Error al guardar el stock')
    } else {
      await registrarLog({
        accion: 'CREAR',
        entidad: 'stock',
        detalle: {
          plancha: tipoSeleccionado?.nombre + ' ' + tipoSeleccionado?.medida,
          categoria: tipoSeleccionado?.categoria,
          total: parseInt(form.total)
        }
      }, profile)
      setForm({ tipo_plancha_id: '', total: '' })
      setCategoriaSeleccionada('')
      setShowForm(false)
      fetchStock()
    }
    setGuardando(false)
  }

  async function handleEditar(id) {
    setGuardando(true)
    const stockActual = stocks.find(s => s.id === id)
    const { error } = await supabase.from('stock_general')
      .update({ total: parseInt(formEditar.total), actualizado_por: profile.id, actualizado_en: new Date().toISOString() })
      .eq('id', id)

    if (!error) await registrarLog({
      accion: 'EDITAR',
      entidad: 'stock',
      detalle: {
        plancha: stockActual?.plancha_nombre + ' ' + stockActual?.plancha_medida,
        total_anterior: stockActual?.total,
        nuevo_total: parseInt(formEditar.total)
      }
    }, profile)

    setEditando(null)
    setGuardando(false)
    fetchStock()
  }

  const disponibleColor = (disponible, total) => {
    if (total === 0) return 'var(--text3)'
    const pct = disponible / total
    if (pct > 0.5) return 'var(--green)'
    if (pct > 0.2) return 'var(--amber)'
    return 'var(--red)'
  }

  const tiposSinStock = tipos.filter(t => !stocks.find(s => s.tipo_plancha_id === t.id) && t.categoria !== 'Servicios')
  const tiposFiltrados = categoriaSeleccionada
    ? tiposSinStock.filter(t => t.categoria === categoriaSeleccionada)
    : tiposSinStock

  const q = busqueda.toLowerCase()
  const stocksFiltrados = q
    ? stocks.filter(s =>
        s.plancha_nombre.toLowerCase().includes(q) ||
        (s.plancha_categoria ?? '').toLowerCase().includes(q) ||
        (s.plancha_medida ?? '').toLowerCase().includes(q)
      )
    : stocks

  const totalDisponible = stocks.reduce((sum, s) => sum + s.disponible, 0)
  const totalVendido = stocks.reduce((sum, s) => sum + s.vendido, 0)

  return (
    <div style={{ color: 'var(--text1)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px' }}>Stock de planchas</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{stocks.length} tipos · {totalDisponible} disponibles · {totalVendido} vendidas</p>
        </div>
        {esAdmin && (
          <button onClick={() => { setShowForm(!showForm); setError(''); setCategoriaSeleccionada(''); setForm({ tipo_plancha_id: '', total: '' }) }}
            style={{ background: showForm ? 'var(--bg3)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500' }}>
            {showForm ? 'Cancelar' : '+ Agregar plancha'}
          </button>
        )}
      </div>

      {/* Formulario agregar */}
      {showForm && esAdmin && (
        <form onSubmit={handleAgregar} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '500', marginBottom: '16px' }}>Agregar plancha al stock</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>1. Categoría</label>
              <select value={categoriaSeleccionada}
                onChange={e => { setCategoriaSeleccionada(e.target.value); setForm({ ...form, tipo_plancha_id: '' }) }}>
                <option value="">Selecciona categoría...</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>2. Tipo de plancha</label>
              <select required value={form.tipo_plancha_id}
                onChange={e => setForm({ ...form, tipo_plancha_id: e.target.value })}
                disabled={!categoriaSeleccionada}>
                <option value="">{categoriaSeleccionada ? 'Selecciona plancha...' : 'Primero elige categoría'}</option>
                {tiposFiltrados.map(t => <option key={t.id} value={t.id}>{t.nombre} — {t.medida}</option>)}
              </select>
              {categoriaSeleccionada && tiposFiltrados.length === 0 && (
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Todas ya tienen stock</p>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>3. Cantidad total</label>
              <input type="number" required min="1" value={form.total}
                onChange={e => setForm({ ...form, total: e.target.value })}
                disabled={!form.tipo_plancha_id} placeholder="Ej: 120" />
            </div>
          </div>
          {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '12px' }}>{error}</p>}
          <button type="submit" disabled={guardando || !form.tipo_plancha_id || !form.total}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: '500', marginTop: '16px', opacity: guardando ? 0.7 : 1 }}>
            {guardando ? 'Guardando...' : 'Guardar stock'}
          </button>
        </form>
      )}

      {/* Buscador */}
      <div style={{ marginBottom: '16px' }}>
        <input type="text" placeholder="🔍 Buscar plancha..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          style={{ maxWidth: '320px' }} />
      </div>

      {/* Cards stock */}
      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando stock...</p>
      ) : stocks.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text3)' }}>No hay stock registrado.</p>
          {esAdmin && <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>Usa el botón "Agregar plancha" para comenzar.</p>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {stocksFiltrados.map(s => (
            <div key={s.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '2px' }}>{s.plancha_categoria}</p>
                  <h3 style={{ fontSize: '15px', fontWeight: '500', color: 'var(--text1)', marginBottom: '2px' }}>{s.plancha_nombre}</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{s.plancha_medida}</p>
                </div>
                <span style={{ fontSize: '28px', fontWeight: '500', color: disponibleColor(s.disponible, s.total) }}>
                  {s.disponible}
                </span>
              </div>

              <div style={{ background: 'var(--bg3)', borderRadius: '99px', height: '4px', marginBottom: '10px' }}>
                <div style={{
                  height: '4px', borderRadius: '99px',
                  background: disponibleColor(s.disponible, s.total),
                  width: `${Math.max(0, (s.disponible / s.total) * 100)}%`,
                  transition: 'width 0.3s'
                }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text3)' }}>
                <span>Vendidas: <span style={{ color: 'var(--text2)' }}>{s.vendido}</span></span>
                <span>Total: <span style={{ color: 'var(--text2)' }}>{s.total}</span></span>
              </div>

              {esAdmin && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                  {editando === s.id ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input type="number" min="1" value={formEditar.total}
                        onChange={e => setFormEditar({ total: e.target.value })}
                        style={{ width: '80px', padding: '4px 8px', fontSize: '12px' }} />
                      <button onClick={() => handleEditar(s.id)} disabled={guardando}
                        style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px' }}>
                        OK
                      </button>
                      <button onClick={() => setEditando(null)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '11px' }}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditando(s.id); setFormEditar({ total: s.total }) }}
                      style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text3)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', width: '100%' }}>
                      Editar total
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}