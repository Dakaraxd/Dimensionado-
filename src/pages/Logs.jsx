import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const accionConfig = {
  CREAR:      { bg: 'rgba(16,185,129,0.12)',  color: 'var(--green)',  border: 'rgba(16,185,129,0.3)',  icono: '➕', texto: 'creó' },
  EDITAR:     { bg: 'rgba(59,130,246,0.12)',  color: 'var(--info)',   border: 'rgba(37,99,235,0.3)',  icono: '✏️', texto: 'editó' },
  ELIMINAR:   { bg: 'rgba(239,68,68,0.12)',   color: 'var(--red)',    border: 'rgba(239,68,68,0.3)',   icono: '🗑️', texto: 'eliminó' },
  APROBAR:    { bg: 'rgba(16,185,129,0.12)',  color: 'var(--green)',  border: 'rgba(16,185,129,0.3)',  icono: '✅', texto: 'aprobó' },
  CANCELAR:   { bg: 'rgba(239,68,68,0.12)',   color: 'var(--red)',    border: 'rgba(239,68,68,0.3)',   icono: '❌', texto: 'canceló' },
  ACTIVAR:    { bg: 'rgba(16,185,129,0.12)',  color: 'var(--green)',  border: 'rgba(16,185,129,0.3)',  icono: '🟢', texto: 'activó' },
  ACCESO:     { bg: 'rgba(37,99,235,0.1)',    color: 'var(--info)',   border: 'rgba(37,99,235,0.3)',   icono: '🔑', texto: 'ingresó con' },
  DESACTIVAR: { bg: 'rgba(107,114,128,0.12)', color: 'var(--text3)',  border: 'rgba(107,114,128,0.3)', icono: '⭕', texto: 'desactivó' },
}

const entidadTexto = {
  orden:    'una orden',
  stock:    'el stock',
  plancha:  'una plancha',
  usuario:  'un usuario',
  proyecto: 'un proyecto de dimensionado',
  sesion:   'acceso rápido con PIN',
}

function descripcionLegible(accion, entidad, detalle) {
  if (!detalle) return null

  if (entidad === 'orden') {
    if (accion === 'CREAR') return `${detalle.cantidad} planchas de ${detalle.plancha} para el ${detalle.fecha_agendada ? new Date(detalle.fecha_agendada + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}`
    if (accion === 'APROBAR') return `${detalle.cantidad} planchas de ${detalle.plancha} — Boleta #${detalle.nro_boleta}`
    if (accion === 'CANCELAR') return `${detalle.cantidad} planchas de ${detalle.plancha}`
    if (accion === 'ELIMINAR') return `${detalle.cantidad} planchas de ${detalle.plancha}`
  }

  if (entidad === 'stock') {
    if (accion === 'CREAR') return `${detalle.plancha} — ${detalle.total} unidades ingresadas`
    if (accion === 'EDITAR') return `${detalle.plancha} — de ${detalle.total_anterior} a ${detalle.nuevo_total} unidades`
  }

  if (entidad === 'plancha') {
    if (accion === 'CREAR') return `${detalle.nombre} (SKU: ${detalle.sku}) en categoría ${detalle.categoria}`
    if (accion === 'EDITAR') return `${detalle.nombre_anterior} → ${detalle.nombre_nuevo}`
    if (accion === 'ACTIVAR' || accion === 'DESACTIVAR') return `${detalle.nombre} (SKU: ${detalle.sku})`
  }

  if (entidad === 'usuario') {
    if (accion === 'CREAR') return `${detalle.nombre} (${detalle.email}) con rol ${detalle.rol}`
  }

  if (entidad === 'sesion') return 'Cambio rápido de usuario en un equipo vinculado'

  if (entidad === 'proyecto') {
    if (accion === 'CREAR') return `Cliente ${detalle.cliente} — ${detalle.plancha ?? ''}`
    if (accion === 'ELIMINAR') return `Cliente ${detalle.cliente} — ${detalle.plancha ?? ''}`
  }

  return JSON.stringify(detalle)
}

export default function Logs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroAccion, setFiltroAccion] = useState('Todas')
  const [filtroEntidad, setFiltroEntidad] = useState('Todas')

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('logs')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(200)
    setLogs(data ?? [])
    setLoading(false)
  }

  const acciones = ['Todas', 'CREAR', 'EDITAR', 'ELIMINAR', 'APROBAR', 'CANCELAR', 'ACTIVAR', 'DESACTIVAR', 'ACCESO']
  const entidades = ['Todas', 'orden', 'stock', 'plancha', 'usuario', 'proyecto', 'sesion']

  const logsFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase()
    return logs.filter(l => {
      const matchBusqueda = !q ||
        (l.usuario_nombre ?? '').toLowerCase().includes(q) ||
        (l.accion ?? '').toLowerCase().includes(q) ||
        (l.entidad ?? '').toLowerCase().includes(q) ||
        JSON.stringify(l.detalle ?? {}).toLowerCase().includes(q)
      const matchAccion = filtroAccion === 'Todas' || l.accion === filtroAccion
      const matchEntidad = filtroEntidad === 'Todas' || l.entidad === filtroEntidad
      return matchBusqueda && matchAccion && matchEntidad
    })
  }, [logs, busqueda, filtroAccion, filtroEntidad])

  // Agrupar por día
  const porDia = logsFiltrados.reduce((acc, l) => {
    const fecha = new Date(l.creado_en).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    if (!acc[fecha]) acc[fecha] = []
    acc[fecha].push(l)
    return acc
  }, {})

  return (
    <div style={{ color: 'var(--text1)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px' }}>Registro de actividad</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{logsFiltrados.length} eventos registrados</p>
        </div>
        <button onClick={fetchLogs}
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}>
          ↻ Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <input type="text" placeholder="🔍 Buscar por usuario, acción o detalle..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: '200px' }} />
        <select value={filtroAccion} onChange={e => setFiltroAccion(e.target.value)} style={{ minWidth: '150px' }}>
          {acciones.map(a => <option key={a} value={a}>{a === 'Todas' ? 'Todas las acciones' : a}</option>)}
        </select>
        <select value={filtroEntidad} onChange={e => setFiltroEntidad(e.target.value)} style={{ minWidth: '150px' }}>
          {entidades.map(e => <option key={e} value={e}>{e === 'Todas' ? 'Todas las áreas' : e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando actividad...</p>
      ) : logsFiltrados.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text3)' }}>No hay actividad registrada.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {Object.entries(porDia).map(([dia, items]) => (
            <div key={dia}>
              {/* Header día */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{ height: '1px', background: 'var(--border)', flex: 1 }} />
                <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: '500', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                  {dia}
                </span>
                <div style={{ height: '1px', background: 'var(--border)', flex: 1 }} />
              </div>

              {/* Cards del día */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {items.map(l => {
                  const cfg = accionConfig[l.accion] ?? { bg: 'var(--bg3)', color: 'var(--text3)', border: 'var(--border)', icono: '📝', texto: 'realizó acción en' }
                  const desc = descripcionLegible(l.accion, l.entidad, l.detalle)

                  return (
                    <div key={l.id} style={{
                      background: 'var(--bg2)',
                      border: `1px solid var(--border)`,
                      borderLeft: `3px solid ${cfg.color}`,
                      borderRadius: '12px',
                      padding: '16px 18px',
                      display: 'flex', alignItems: 'flex-start', gap: '14px'
                    }}>
                      {/* Icono */}
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: cfg.bg, border: `1px solid ${cfg.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '18px', flexShrink: 0
                      }}>
                        {cfg.icono}
                      </div>

                      {/* Contenido */}
                      <div style={{ flex: 1 }}>
                        {/* Frase principal */}
                        <p style={{ fontSize: '14px', color: 'var(--text1)', marginBottom: '4px', lineHeight: '1.4' }}>
                          <span style={{ fontWeight: '600', color: 'var(--primary)' }}>{l.usuario_nombre}</span>
                          {' '}{cfg.texto}{' '}
                          <span style={{ color: cfg.color, fontWeight: '500' }}>{entidadTexto[l.entidad] ?? l.entidad}</span>
                        </p>

                        {/* Descripción legible */}
                        {desc && (
                          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '6px' }}>
                            {desc}
                          </p>
                        )}

                        {/* Badge acción */}
                        <span style={{
                          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                          fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '99px',
                          textTransform: 'uppercase', letterSpacing: '.04em'
                        }}>
                          {l.accion}
                        </span>
                      </div>

                      {/* Hora */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text2)' }}>
                          {new Date(l.creado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                          {new Date(l.creado_en).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}