import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { diaDe, horaDe, etiquetaDia } from '../lib/periodos'
import { Avatar } from '../components/CuentasRapidas'
import NumeroAnimado from '../components/NumeroAnimado'

// Cada acción tiene su color (los de la paleta) y su icono; --c y --cs se usan en la línea de tiempo
const accionConfig = {
  CREAR:      { nombre: 'Crear',      bg: 'rgba(16,185,129,0.12)',  color: 'var(--green)',  icono: '➕', texto: 'creó' },
  EDITAR:     { nombre: 'Editar',     bg: 'rgba(59,130,246,0.12)',  color: 'var(--info)',   icono: '✏️', texto: 'editó' },
  ELIMINAR:   { nombre: 'Eliminar',   bg: 'rgba(239,68,68,0.12)',   color: 'var(--red)',    icono: '🗑️', texto: 'eliminó' },
  APROBAR:    { nombre: 'Aprobar',    bg: 'rgba(16,185,129,0.12)',  color: 'var(--green)',  icono: '✅', texto: 'aprobó' },
  CANCELAR:   { nombre: 'Cancelar',   bg: 'rgba(239,68,68,0.12)',   color: 'var(--red)',    icono: '❌', texto: 'canceló' },
  ACTIVAR:    { nombre: 'Activar',    bg: 'rgba(16,185,129,0.12)',  color: 'var(--green)',  icono: '🟢', texto: 'activó' },
  ACCESO:     { nombre: 'Acceso',     bg: 'rgba(37,99,235,0.1)',    color: 'var(--info)',   icono: '🔑', texto: 'ingresó con' },
  DESACTIVAR: { nombre: 'Desactivar', bg: 'rgba(107,114,128,0.12)', color: 'var(--text3)',  icono: '⭕', texto: 'desactivó' },
}
const configPorDefecto = { nombre: 'Acción', bg: 'var(--bg3)', color: 'var(--text3)', icono: '📝', texto: 'realizó una acción en' }

const entidadTexto = {
  orden:    'una orden',
  stock:    'el stock',
  plancha:  'una plancha',
  usuario:  'un usuario',
  proyecto: 'un proyecto de dimensionado',
  sesion:   'acceso rápido con PIN',
}
const entidadChip = {
  orden:    { icono: '🧾', nombre: 'Órdenes' },
  stock:    { icono: '📦', nombre: 'Stock' },
  plancha:  { icono: '🟫', nombre: 'Planchas' },
  usuario:  { icono: '👤', nombre: 'Usuarios' },
  proyecto: { icono: '✂️', nombre: 'Dimensionado' },
  sesion:   { icono: '🔐', nombre: 'Accesos' },
}

function descripcionLegible(accion, entidad, detalle) {
  if (!detalle) return null

  if (entidad === 'orden') {
    if (accion === 'CREAR') return `${detalle.cantidad} planchas de ${detalle.plancha} para el ${detalle.fecha_agendada ? new Date(detalle.fecha_agendada + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}`
    if (accion === 'APROBAR') return `${detalle.cantidad} planchas de ${detalle.plancha} — Boleta #${detalle.nro_boleta}`
    if (accion === 'CANCELAR') return `${detalle.cantidad} planchas de ${detalle.plancha}${detalle.motivo ? ` — ${detalle.motivo}` : ''}`
    if (accion === 'ELIMINAR') return `${detalle.cantidad} planchas de ${detalle.plancha}`
  }

  if (entidad === 'stock') {
    if (accion === 'CREAR') return `${detalle.plancha} — ${detalle.total} unidades ingresadas`
    // Movimiento de inventario autorizado por un subgerente
    if (accion === 'EDITAR' && detalle.movimiento) {
      const nombres = { ingreso: 'Ingreso', merma: 'Merma', devolucion: 'Devolución', ajuste: 'Ajuste' }
      const n = detalle.movimiento === 'ajuste' && detalle.cantidad > 0 ? `+${detalle.cantidad}` : detalle.cantidad
      return `${nombres[detalle.movimiento] ?? detalle.movimiento} de ${n} planchas${detalle.plancha ? ` — ${detalle.plancha}` : ''}${detalle.autorizado_por ? ` · autorizó ${detalle.autorizado_por}` : ''}`
    }
    if (accion === 'EDITAR') return `${detalle.plancha} — de ${detalle.total_anterior} a ${detalle.nuevo_total} unidades`
  }

  if (entidad === 'plancha') {
    if (accion === 'CREAR') return `${detalle.nombre} (SKU: ${detalle.sku}) en categoría ${detalle.categoria}`
    if (accion === 'EDITAR') return `${detalle.nombre_anterior} → ${detalle.nombre_nuevo}`
    if (accion === 'ACTIVAR' || accion === 'DESACTIVAR') return `${detalle.nombre} (SKU: ${detalle.sku})`
  }

  if (entidad === 'usuario') {
    if (accion === 'CREAR') return `${detalle.nombre} (${detalle.email}) con rol ${detalle.rol}`
    if (accion === 'EDITAR' && detalle.cambio) return `${detalle.cambio}${detalle.nombre ? ` — ${detalle.nombre}` : ''}`
  }

  if (entidad === 'sesion') return 'Cambio rápido de usuario en un equipo vinculado'

  if (entidad === 'proyecto') {
    if (accion === 'CREAR') return `Cliente ${detalle.cliente} — ${detalle.plancha ?? ''}`
    if (accion === 'ELIMINAR') return `Cliente ${detalle.cliente} — ${detalle.plancha ?? ''}`
  }

  return JSON.stringify(detalle)
}

// "hace 5 min" para lo muy reciente; para lo demás solo se muestra la hora
function tiempoRelativo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return ''
}

const POR_PAGINA = 40

export default function Logs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroAccion, setFiltroAccion] = useState('Todas')
  const [filtroEntidad, setFiltroEntidad] = useState('Todas')
  const [limite, setLimite] = useState(POR_PAGINA)

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

  const acciones = ['Todas', ...Object.keys(accionConfig)]
  const entidades = ['Todas', ...Object.keys(entidadChip)]

  const coincideBusqueda = (l, q) => !q ||
    (l.usuario_nombre ?? '').toLowerCase().includes(q) ||
    (l.accion ?? '').toLowerCase().includes(q) ||
    (l.entidad ?? '').toLowerCase().includes(q) ||
    JSON.stringify(l.detalle ?? {}).toLowerCase().includes(q)

  const q = busqueda.toLowerCase()
  const logsFiltrados = useMemo(() => logs.filter(l =>
    coincideBusqueda(l, q) &&
    (filtroAccion === 'Todas' || l.accion === filtroAccion) &&
    (filtroEntidad === 'Todas' || l.entidad === filtroEntidad)
  ), [logs, q, filtroAccion, filtroEntidad])

  // Los contadores de cada chip respetan los demás filtros
  const cuenta = (campo, valor) => logs.filter(l =>
    coincideBusqueda(l, q) &&
    (campo === 'accion' || filtroAccion === 'Todas' || l.accion === filtroAccion) &&
    (campo === 'entidad' || filtroEntidad === 'Todas' || l.entidad === filtroEntidad) &&
    (valor === 'Todas' || l[campo] === valor)
  ).length

  const resumen = useMemo(() => {
    const hoy = diaDe(new Date().toISOString())
    const personas = new Set(logsFiltrados.map(l => l.usuario_nombre).filter(Boolean))
    const porAccion = {}
    logsFiltrados.forEach(l => { porAccion[l.accion] = (porAccion[l.accion] ?? 0) + 1 })
    const top = Object.entries(porAccion).sort((a, b) => b[1] - a[1])[0]
    return {
      total: logsFiltrados.length,
      personas: personas.size,
      hoy: logsFiltrados.filter(l => diaDe(l.creado_en) === hoy).length,
      top: top ? { nombre: (accionConfig[top[0]] ?? configPorDefecto).nombre, n: top[1], icono: (accionConfig[top[0]] ?? configPorDefecto).icono } : null,
    }
  }, [logsFiltrados])

  const visibles = logsFiltrados.slice(0, limite)
  const porDia = visibles.reduce((acc, l) => {
    const dia = diaDe(l.creado_en)
    ;(acc[dia] ??= []).push(l)
    return acc
  }, {})
  const hayFiltro = busqueda !== '' || filtroAccion !== 'Todas' || filtroEntidad !== 'Todas'
  const limpiar = () => { setBusqueda(''); setFiltroAccion('Todas'); setFiltroEntidad('Todas'); setLimite(POR_PAGINA) }
  const elegirAccion = (a) => { setFiltroAccion(a); setLimite(POR_PAGINA) }
  const elegirEntidad = (e) => { setFiltroEntidad(e); setLimite(POR_PAGINA) }
  const idMasReciente = logs[0]?.id

  return (
    <div style={{ color: 'var(--text1)' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '2px' }}>Registro de actividad</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Todo lo que ocurre en la tienda, en orden: quién hizo qué y cuándo</p>
        </div>
        <button onClick={fetchLogs} disabled={loading}
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '99px', padding: '8px 16px', fontSize: '13px', fontWeight: 600 }}>
          <span className={loading ? 'girando' : ''}>↻</span> {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {/* Resumen */}
      <div className="stat-grid">
        <div className="stat-card" style={{ '--c': 'var(--primary)', '--cs': 'var(--primary-soft)' }}>
          <div className="stat-icono">📋</div>
          <div>
            <p className="stat-valor"><NumeroAnimado valor={resumen.total} /></p>
            <p className="stat-titulo">Eventos</p>
            <p className="stat-detalle">{hayFiltro ? 'con los filtros actuales' : 'últimos registrados'}</p>
          </div>
        </div>
        <div className="stat-card" style={{ '--c': 'var(--info)', '--cs': 'var(--info-soft)' }}>
          <div className="stat-icono">👥</div>
          <div>
            <p className="stat-valor"><NumeroAnimado valor={resumen.personas} /></p>
            <p className="stat-titulo">Personas activas</p>
            <p className="stat-detalle">con movimientos</p>
          </div>
        </div>
        <div className="stat-card" style={{ '--c': 'var(--green)', '--cs': 'var(--green-soft)' }}>
          <div className="stat-icono">📅</div>
          <div>
            <p className="stat-valor"><NumeroAnimado valor={resumen.hoy} /></p>
            <p className="stat-titulo">Hoy</p>
            <p className="stat-detalle">eventos del día</p>
          </div>
        </div>
        <div className="stat-card" style={{ '--c': 'var(--amber)', '--cs': 'var(--amber-soft)' }}>
          <div className="stat-icono">{resumen.top?.icono ?? '⭐'}</div>
          <div>
            <p className="stat-valor texto">{resumen.top ? resumen.top.nombre : '—'}</p>
            <p className="stat-titulo">Acción más frecuente</p>
            <p className="stat-detalle">{resumen.top ? `${resumen.top.n} veces` : 'sin datos'}</p>
          </div>
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="buscador">
          <span className="lupa">🔍</span>
          <input type="text" placeholder="Buscar por persona, acción o detalle..."
            value={busqueda} onChange={e => { setBusqueda(e.target.value); setLimite(POR_PAGINA) }} />
        </div>
        {hayFiltro && (
          <button onClick={limpiar}
            style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: 600 }}>✕ Limpiar filtros</button>
        )}
      </div>
      <div className="chip-fila" style={{ marginBottom: '10px' }}>
        {acciones.map(a => {
          const c = accionConfig[a]
          return (
            <button key={a} className={`chip-x${filtroAccion === a ? ' activo' : ''}`} style={{ '--c': c?.color ?? 'var(--primary)' }} onClick={() => elegirAccion(a)}>
              {c ? `${c.icono} ${c.nombre}` : 'Todas las acciones'} <span className="n">{cuenta('accion', a)}</span>
            </button>
          )
        })}
      </div>
      <div className="chip-fila" style={{ marginBottom: '26px' }}>
        {entidades.map(e => {
          const c = entidadChip[e]
          return (
            <button key={e} className={`chip-x${filtroEntidad === e ? ' activo' : ''}`} style={{ '--c': 'var(--info)' }} onClick={() => elegirEntidad(e)}>
              {c ? `${c.icono} ${c.nombre}` : 'Todas las áreas'} <span className="n">{cuenta('entidad', e)}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando actividad...</p>
      ) : logsFiltrados.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
          <p className="rebote" style={{ fontSize: '38px', marginBottom: '8px' }}>🕊️</p>
          <p style={{ color: 'var(--text2)', fontWeight: 600 }}>{hayFiltro ? 'Nada coincide con esos filtros' : 'Todavía no hay actividad registrada'}</p>
          {hayFiltro && <button onClick={limpiar} style={{ marginTop: '10px', background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '13px' }}>Limpiar filtros</button>}
        </div>
      ) : (
        <div>
          {Object.entries(porDia).map(([dia, items]) => (
            <div key={dia}>
              <div className="act-dia">
                <span className="act-dia-pildora">📅 <span className="t">{etiquetaDia(dia)}</span> <span className="n">{items.length} evento{items.length === 1 ? '' : 's'}</span></span>
                <span className="act-dia-linea" />
              </div>

              <div className="act-lista">
                {items.map((l, i) => {
                  const cfg = accionConfig[l.accion] ?? configPorDefecto
                  const desc = descripcionLegible(l.accion, l.entidad, l.detalle)
                  const ent = entidadChip[l.entidad]
                  const rel = tiempoRelativo(l.creado_en)
                  return (
                    <div key={l.id} className={`act-item${l.id === idMasReciente ? ' nuevo' : ''}`} style={{ '--c': cfg.color, '--cs': cfg.bg, '--i': i }}>
                      <div className="act-nodo" aria-hidden="true">{cfg.icono}</div>
                      <div className="act-tarjeta">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <Avatar nombre={l.usuario_nombre} tamano={30} />
                          <p style={{ flex: 1, minWidth: '180px', fontSize: '14px', lineHeight: 1.4 }}>
                            <span style={{ fontWeight: 700 }}>{l.usuario_nombre}</span>
                            {' '}{cfg.texto}{' '}
                            <span style={{ color: cfg.color, fontWeight: 600 }}>{entidadTexto[l.entidad] ?? l.entidad}</span>
                          </p>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>{horaDe(l.creado_en)}</p>
                            {rel && <p style={{ fontSize: '11px', color: 'var(--text3)' }}>{rel}</p>}
                          </div>
                        </div>
                        {desc && <p style={{ fontSize: '13px', color: 'var(--text2)', margin: '8px 0 0 40px', lineHeight: 1.45, wordBreak: 'break-word' }}>{desc}</p>}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '9px 0 0 40px' }}>
                          <span className="etiqueta" style={{ background: cfg.bg, color: cfg.color }}>{l.accion}</span>
                          {ent && <span className="etiqueta neutra">{ent.icono} {ent.nombre}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {logsFiltrados.length > limite && (
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => setLimite(l => l + POR_PAGINA)}
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text1)', borderRadius: '99px', padding: '10px 22px', fontSize: '13px', fontWeight: 600 }}>
                Mostrar {Math.min(POR_PAGINA, logsFiltrados.length - limite)} más ({logsFiltrados.length - limite} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
