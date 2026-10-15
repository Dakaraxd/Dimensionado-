import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { registrarLog } from '../lib/logger'
import { hoyChile } from '../lib/fechas'
import { PLANCHA_W_DEFAULT, PLANCHA_H_DEFAULT } from '../lib/optimizador'
import EditorCortes from '../components/EditorCortes'

// Los proyectos de corte se crean desde "Nueva venta". Aquí se consultan, filtran y
// reimprimen; un proyecto abre en modo solo lectura.
export default function Dimensionador({ onNuevaVenta }) {
  const { profile } = useAuth()
  const [proyectos, setProyectos] = useState([])
  const [proyectoActivo, setProyectoActivo] = useState(null)
  const [filtroFecha, setFiltroFecha] = useState('todos') // 'todos' | 'hoy' | 'semana' | 'mes'
  const [busquedaProyecto, setBusquedaProyecto] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')

  const esAdmin = profile?.rol === 'administrador'
  const puedeVender = profile?.rol === 'administrador' || profile?.rol === 'vendedor'

  useEffect(() => { fetchProyectos() }, [])

  async function fetchProyectos() {
    const { data } = await supabase
      .from('proyectos_dimensionado')
      .select('*')
      .order('creado_en', { ascending: false })
    setProyectos(data ?? [])
  }

  async function handleEliminar(p) {
    if (!confirm('¿Eliminar este proyecto?')) return
    const { error } = await supabase.from('proyectos_dimensionado').delete().eq('id', p.id)
    if (error) { alert('No se pudo eliminar el proyecto'); return }
    await registrarLog({
      accion: 'ELIMINAR',
      entidad: 'proyecto',
      detalle: { cliente: p.cliente_nombre, plancha: `${p.plancha_nombre ?? ''} ${p.plancha_medida ?? ''}`.trim() }
    }, profile)
    fetchProyectos()
    if (proyectoActivo?.id === p.id) setProyectoActivo(null)
  }

  // Los proyectos antiguos guardaron `resultado` como array; los nuevos como { dims, planchas }
  function extraerResultado(p) {
    const res = p.resultado
    if (Array.isArray(res)) return { dims: { w: PLANCHA_W_DEFAULT, h: PLANCHA_H_DEFAULT }, planchas: res }
    return { dims: res?.dims ?? { w: PLANCHA_W_DEFAULT, h: PLANCHA_H_DEFAULT }, planchas: res?.planchas ?? [] }
  }

  // ── VISOR DE UN PROYECTO ──
  if (proyectoActivo) {
    const { dims, planchas } = extraerResultado(proyectoActivo)
    return (
      <div style={{ color: 'var(--text1)', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <button onClick={() => setProyectoActivo(null)}
            style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', cursor: 'pointer' }}>
            ← Volver a proyectos
          </button>
        </div>
        <EditorCortes
          key={proyectoActivo.id}
          soloLectura
          cliente={{ nombre: proyectoActivo.cliente_nombre, rut: proyectoActivo.cliente_rut ?? '', telefono: proyectoActivo.cliente_telefono ?? '' }}
          plancha={{ plancha_nombre: proyectoActivo.plancha_nombre, plancha_medida: proyectoActivo.plancha_medida }}
          inicial={{ piezas: Array.isArray(proyectoActivo.piezas) ? proyectoActivo.piezas : [], dims, planchas }}
        />
      </div>
    )
  }

  // ── LISTA DE PROYECTOS ──
  const hoy = hoyChile()
  // Fecha (YYYY-MM-DD) de un proyecto en horario de Chile
  const fechaDe = (p) => new Date(p.creado_en).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const lunes = new Date(`${hoy}T12:00:00`)
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
  const inicioSemana = lunes.toLocaleDateString('en-CA')
  const enRango = (p, filtro) => {
    const f = fechaDe(p)
    if (filtro === 'hoy') return f === hoy
    if (filtro === 'semana') return f >= inicioSemana
    if (filtro === 'mes') return f.slice(0, 7) === hoy.slice(0, 7)
    return true
  }
  // m² de piezas pedidas (largo y ancho en cm)
  const m2De = (p) => (Array.isArray(p.piezas) ? p.piezas : []).reduce(
    (s, z) => s + (parseFloat(z.cantidad) || 0) * (parseFloat(z.largo) || 0) * (parseFloat(z.ancho) || 0) / 10000, 0)

  const proyectosHoy = proyectos.filter(p => enRango(p, 'hoy'))
  const proyectosMes = proyectos.filter(p => enRango(p, 'mes'))
  const tablerosHoy = proyectosHoy.reduce((s, p) => s + extraerResultado(p).planchas.length, 0)
  const m2Hoy = proyectosHoy.reduce((s, p) => s + m2De(p), 0)

  const q = busquedaProyecto.trim().toLowerCase()
  const vendedores = [...new Set(proyectos.map(p => p.creado_por_nombre).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const proyectosFiltrados = proyectos.filter(p =>
    enRango(p, filtroFecha) &&
    (filtroVendedor === '' || p.creado_por_nombre === filtroVendedor) &&
    (q === '' ||
      (p.cliente_nombre ?? '').toLowerCase().includes(q) ||
      (p.cliente_rut ?? '').toLowerCase().includes(q) ||
      `${p.plancha_nombre ?? ''} ${p.plancha_medida ?? ''}`.toLowerCase().includes(q))
  )
  const hayFiltro = filtroFecha !== 'todos' || filtroVendedor !== '' || q !== ''

  const chip = (activo) => ({
    padding: '6px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
    border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
    background: activo ? 'var(--primary)' : 'var(--bg2)',
    color: activo ? '#fff' : 'var(--text2)'
  })
  const tarjeta = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 18px' }
  const indicador = (icono, titulo, valor, detalle) => (
    <div key={titulo} style={tarjeta}>
      <p style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: '600', marginBottom: '6px' }}>{icono} {titulo}</p>
      <p style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text1)', lineHeight: 1.1 }}>{valor}</p>
      <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{detalle}</p>
    </div>
  )

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px' }}>Proyectos de corte</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
            {proyectos.length} proyectos guardados · se crean desde <strong>Nueva venta</strong>
          </p>
        </div>
        {puedeVender && onNuevaVenta && (
          <button onClick={onNuevaVenta}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '500' }}>
            + Nueva venta
          </button>
        )}
      </div>

      {proyectos.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {indicador('✂️', 'Dimensionados hoy', proyectosHoy.length, proyectosHoy.length === 1 ? 'proyecto' : 'proyectos')}
            {indicador('📐', 'Tableros usados hoy', tablerosHoy, 'planchas a cortar')}
            {indicador('📏', 'm² cortados hoy', m2Hoy.toFixed(1), 'según piezas pedidas')}
            {indicador('📅', 'Dimensionados del mes', proyectosMes.length, `${proyectos.length} en total`)}
          </div>

          <div style={{ marginBottom: '10px' }}>
            <input type="text" placeholder="🔍 Buscar por cliente, RUT o plancha..."
              value={busquedaProyecto} onChange={e => setBusquedaProyecto(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
            <button style={chip(filtroFecha === 'todos')} onClick={() => setFiltroFecha('todos')}>Todos</button>
            <button style={chip(filtroFecha === 'hoy')} onClick={() => setFiltroFecha('hoy')}>Hoy ({proyectosHoy.length})</button>
            <button style={chip(filtroFecha === 'semana')} onClick={() => setFiltroFecha('semana')}>Esta semana</button>
            <button style={chip(filtroFecha === 'mes')} onClick={() => setFiltroFecha('mes')}>Este mes ({proyectosMes.length})</button>
            {vendedores.length > 0 && (
              <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={{ width: 'auto', minWidth: '180px' }}>
                <option value="">Todos los vendedores</option>
                {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
            {hayFiltro && (
              <>
                <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                  {proyectosFiltrados.length} resultado{proyectosFiltrados.length !== 1 ? 's' : ''}
                </span>
                <button onClick={() => { setFiltroFecha('todos'); setFiltroVendedor(''); setBusquedaProyecto('') }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: '500' }}>
                  ✕ Limpiar filtros
                </button>
              </>
            )}
          </div>
        </>
      )}

      {proyectos.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '32px', marginBottom: '12px' }}>✂️</p>
          <p style={{ color: 'var(--text3)', fontSize: '14px' }}>No hay proyectos de corte guardados aún.</p>
          <p style={{ color: 'var(--text3)', fontSize: '12px', marginTop: '6px' }}>Se crean al registrar una venta con cortes.</p>
          {puedeVender && onNuevaVenta && (
            <button onClick={onNuevaVenta}
              style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: '500', marginTop: '16px' }}>
              Ir a Nueva venta
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {proyectosFiltrados.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '32px' }}>
              No hay proyectos que coincidan con los filtros
            </p>
          )}
          {proyectosFiltrados.map(p => (
            <div key={p.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '15px', fontWeight: '500' }}>{p.cliente_nombre}</p>
                  {p.cliente_rut && <span style={{ fontSize: '12px', color: 'var(--text3)' }}>RUT: {p.cliente_rut}</span>}
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text3)' }}>🟫 {p.plancha_nombre} {p.plancha_medida}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text3)' }}>📐 {extraerResultado(p).planchas.length} tablero{extraerResultado(p).planchas.length !== 1 ? 's' : ''}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text3)' }}>👤 {p.creado_por_nombre}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text3)' }}>🕐 {new Date(p.creado_en).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setProyectoActivo(p)}
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid rgba(242,107,29,0.35)', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: '500' }}>
                  Ver
                </button>
                {esAdmin && (
                  <button onClick={() => handleEliminar(p)}
                    style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)', borderRadius: '8px', padding: '7px 14px', fontSize: '12px' }}>
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
