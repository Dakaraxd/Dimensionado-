import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { registrarLog } from '../lib/logger'
import { CATEGORIAS_CON_SERVICIOS } from '../lib/constants'

export default function Planchas() {
  const [planchas, setPlanchas] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [categoriasAbiertas, setCategoriasAbiertas] = useState({})
  const [form, setForm] = useState({ nombre: '', medida: '', categoria: '', sku: '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const categorias = CATEGORIAS_CON_SERVICIOS

  const categoriaColorDark = {
    'Melamina': { bg: 'rgba(139,92,246,0.12)', color: '#6d28d9', border: 'rgba(139,92,246,0.3)' },
    'Cholguán': { bg: 'rgba(245,158,11,0.12)', color: '#b45309', border: 'rgba(245,158,11,0.3)' },
    'Terciado Estructural': { bg: 'rgba(16,185,129,0.12)', color: '#047857', border: 'rgba(16,185,129,0.3)' },
    'Terciado Moldaje': { bg: 'rgba(20,184,166,0.12)', color: '#0f766e', border: 'rgba(20,184,166,0.3)' },
    'Terciado Mueblería': { bg: 'rgba(6,182,212,0.12)', color: '#0e7490', border: 'rgba(6,182,212,0.3)' },
    'MDF Ranurado': { bg: 'rgba(59,130,246,0.12)', color: '#1d4ed8', border: 'rgba(59,130,246,0.3)' },
    'MDF Blanco': { bg: 'rgba(14,165,233,0.12)', color: '#0369a1', border: 'rgba(14,165,233,0.3)' },
    'Placa Aglomerado': { bg: 'rgba(249,115,22,0.12)', color: '#c2410c', border: 'rgba(249,115,22,0.3)' },
    'Tablero OSB': { bg: 'rgba(234,179,8,0.12)', color: '#a16207', border: 'rgba(234,179,8,0.3)' },
    'Placa Trupán': { bg: 'rgba(132,204,22,0.12)', color: '#4d7c0f', border: 'rgba(132,204,22,0.3)' },
    'Otros': { bg: 'rgba(107,114,128,0.12)', color: '#4b5563', border: 'rgba(107,114,128,0.3)' },
    'Servicios': { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c', border: 'rgba(239,68,68,0.3)' },
  }

  useEffect(() => { fetchPlanchas() }, [])

  async function fetchPlanchas() {
    const { data } = await supabase
      .from('tipos_plancha')
      .select('*')
      .order('categoria')
      .order('nombre')
    setPlanchas(data ?? [])
    setLoading(false)
  }

  function toggleCategoria(cat) {
    setCategoriasAbiertas(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  function abrirFormNuevo() {
    setEditando(null)
    setForm({ nombre: '', medida: '', categoria: '', sku: '' })
    setError('')
    setShowForm(true)
  }

  function abrirFormEditar(p) {
    setEditando(p.id)
    setForm({ nombre: p.nombre, medida: p.medida ?? '', categoria: p.categoria ?? '', sku: p.sku ?? '' })
    setError('')
    setShowForm(true)
  }

  async function handleGuardar(e) {
    e.preventDefault()
    setError('')
    setGuardando(true)

    if (editando) {
      const plancha = planchas.find(p => p.id === editando)
      const { error } = await supabase.from('tipos_plancha').update(form).eq('id', editando)
      if (error) { setError('Error al actualizar'); }
      else {
        await registrarLog({
          accion: 'EDITAR',
          entidad: 'plancha',
          detalle: {
            nombre_anterior: plancha?.nombre + ' ' + plancha?.medida,
            nombre_nuevo: form.nombre + ' ' + form.medida,
            sku: form.sku,
            categoria: form.categoria
          }
        })
        setShowForm(false)
        fetchPlanchas()
      }
    } else {
      const { error } = await supabase.from('tipos_plancha').insert(form)
      if (error) { setError('Error al crear plancha') }
      else {
        await registrarLog({
          accion: 'CREAR',
          entidad: 'plancha',
          detalle: {
            nombre: form.nombre + ' ' + form.medida,
            sku: form.sku,
            categoria: form.categoria
          }
        })
        setShowForm(false)
        fetchPlanchas()
      }
    }
    setGuardando(false)
  }

  async function handleToggleActivo(p) {
    const { error } = await supabase.from('tipos_plancha').update({ activo: !p.activo }).eq('id', p.id)
    if (error) return
    await registrarLog({
      accion: p.activo ? 'DESACTIVAR' : 'ACTIVAR',
      entidad: 'plancha',
      detalle: { nombre: p.nombre + ' ' + p.medida, sku: p.sku }
    })
    fetchPlanchas()
  }

  const hayBusqueda = busqueda.trim().length > 0
  const q = busqueda.toLowerCase()
  const planchasFiltradas = planchas.filter(p =>
    p.nombre.toLowerCase().includes(q) ||
    (p.sku ?? '').toLowerCase().includes(q) ||
    (p.medida ?? '').toLowerCase().includes(q)
  )

  const porCategoria = categorias.reduce((acc, cat) => {
    const items = planchas.filter(p => p.categoria === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500' }}>Planchas</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{planchas.length} tipos registrados</p>
        </div>
        <button onClick={abrirFormNuevo}
          style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500' }}>
          + Nueva
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <form onSubmit={handleGuardar} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '500', marginBottom: '16px' }}>
            {editando ? 'Editar plancha' : 'Nueva plancha'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Nombre</label>
              <input type="text" required value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: OSB" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Medida</label>
              <input type="text" value={form.medida}
                onChange={e => setForm({ ...form, medida: e.target.value })}
                placeholder="Ej: 15mm" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Categoría</label>
              <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
                <option value="">Selecciona...</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>SKU</label>
              <input type="text" value={form.sku}
                onChange={e => setForm({ ...form, sku: e.target.value })}
                placeholder="Ej: 246824" />
            </div>
          </div>
          {error && <p style={{ fontSize: '13px', color: 'var(--red)', marginTop: '12px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button type="submit" disabled={guardando}
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', fontSize: '13px', fontWeight: '500', opacity: guardando ? 0.7 : 1 }}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: '8px', padding: '8px 20px', fontSize: '13px' }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Buscador */}
      <div style={{ marginBottom: '16px' }}>
        <input type="text" placeholder="🔍 Buscar por nombre, SKU o medida..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando planchas...</p>
      ) : hayBusqueda ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          {planchasFiltradas.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '32px' }}>No se encontraron planchas</p>
          ) : (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  {['Nombre', 'Medida', 'SKU', 'Estado', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planchasFiltradas.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)', opacity: p.activo ? 1 : 0.4 }}>
                    <td style={{ padding: '10px 16px', fontWeight: '500', color: 'var(--text1)' }}>{p.nombre}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text3)' }}>{p.medida ?? '-'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>{p.sku ?? '-'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ background: p.activo ? 'var(--green-soft)' : 'var(--bg3)', color: p.activo ? 'var(--green)' : 'var(--text3)', fontSize: '11px', padding: '2px 8px', borderRadius: '99px' }}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={() => abrirFormEditar(p)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer' }}>Editar</button>
                        <button onClick={() => handleToggleActivo(p)} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '12px', cursor: 'pointer' }}>
                          {p.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Object.entries(porCategoria).map(([cat, items]) => {
            const colores = categoriaColorDark[cat] ?? { bg: 'var(--bg3)', color: 'var(--text3)', border: 'var(--border)' }
            return (
              <div key={cat} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <button onClick={() => toggleCategoria(cat)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: colores.bg, color: colores.color, border: `1px solid ${colores.border}`, fontSize: '12px', fontWeight: '500', padding: '3px 10px', borderRadius: '99px' }}>
                      {cat}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{items.length} tipo{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <span style={{ color: 'var(--text3)', fontSize: '16px' }}>{categoriasAbiertas[cat] ? '−' : '+'}</span>
                </button>

                {categoriasAbiertas[cat] && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg3)' }}>
                          {['Nombre', 'Medida', 'SKU', 'Estado', 'Acciones'].map(h => (
                            <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(p => (
                          <tr key={p.id} style={{ borderTop: '1px solid var(--border)', opacity: p.activo ? 1 : 0.4 }}>
                            <td style={{ padding: '10px 16px', fontWeight: '500', color: 'var(--text1)' }}>{p.nombre}</td>
                            <td style={{ padding: '10px 16px', color: 'var(--text3)' }}>{p.medida ?? '-'}</td>
                            <td style={{ padding: '10px 16px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>{p.sku ?? '-'}</td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{ background: p.activo ? 'var(--green-soft)' : 'var(--bg3)', color: p.activo ? 'var(--green)' : 'var(--text3)', fontSize: '11px', padding: '2px 8px', borderRadius: '99px' }}>
                                {p.activo ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={() => abrirFormEditar(p)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer' }}>Editar</button>
                                <button onClick={() => handleToggleActivo(p)} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '12px', cursor: 'pointer' }}>
                                  {p.activo ? 'Desactivar' : 'Activar'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}