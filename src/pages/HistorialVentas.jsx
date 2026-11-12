import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { registrarLog } from '../lib/logger'
import { PLANCHA_W_DEFAULT, PLANCHA_H_DEFAULT } from '../lib/optimizador'
import EditorCortes from '../components/EditorCortes'
import { PERIODOS, TZ, diaDe, horaDe, limites, etiquetaDia } from '../lib/periodos'

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px' }
const chip = (activo) => ({
  padding: '6px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
  border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
  background: activo ? 'var(--primary)' : 'var(--bg2)',
  color: activo ? '#fff' : 'var(--text2)'
})

function Tarjeta({ icono, titulo, valor, detalle, colorValor = 'var(--text1)', colorDetalle = 'var(--text3)' }) {
  return (
    <div style={{ ...card, padding: '14px 18px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 600, marginBottom: '6px' }}>{icono} {titulo}</p>
      <p style={{ fontSize: typeof valor === 'number' ? '26px' : '18px', fontWeight: 700, color: colorValor, lineHeight: 1.15, wordBreak: 'break-word' }}>{valor}</p>
      <p style={{ fontSize: '11px', color: colorDetalle, marginTop: '3px' }}>{detalle}</p>
    </div>
  )
}

const Dato = ({ titulo, children }) => (
  <div>
    <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>{titulo}</p>
    <div style={{ fontSize: '13px', color: 'var(--text1)' }}>{children}</div>
  </div>
)

export default function HistorialVentas() {
  const { profile } = useAuth()
  const esAdmin = profile?.rol === 'administrador'

  const [periodo, setPeriodo] = useState('mes')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [ordenes, setOrdenes] = useState([])
  const [conCortes, setConCortes] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroCortes, setFiltroCortes] = useState('todas') // 'todas' | 'con' | 'sin'
  const [verAnuladas, setVerAnuladas] = useState(false)
  const [abierta, setAbierta] = useState(null)
  const [visor, setVisor] = useState(null)

  const rango = limites(periodo, desde, hasta)

  async function cargar() {
    if (!rango) { setOrdenes([]); setLoading(false); return }
    setLoading(true)
    setError('')
    const ini = rango.desde.toISOString()
    const fin = rango.hasta.toISOString()
    const antes = new Date(rango.desde.getTime() - 86400000).toISOString()
    const [ords, proys] = await Promise.all([
      supabase.from('ordenes').select(`
          id, cantidad, estado, nro_boleta, nota, telefono_cliente, cliente_email, cliente_nombre, cliente_rut,
          creado_en, aprobado_en, fecha_agendada,
          vendedor:profiles!vendedor_id(nombre),
          aprobador:profiles!aprobado_por(nombre),
          tipo:tipos_plancha!tipo_plancha_id(nombre, medida, categoria),
          orden_servicios(id, tipo:tipos_plancha!tipo_plancha_id(nombre))
        `)
        .in('estado', ['aprobada', 'cancelada'])
        .not('nro_boleta', 'is', null)
        .gte('aprobado_en', ini).lt('aprobado_en', fin)
        .order('aprobado_en', { ascending: false }),
      supabase.from('proyectos_dimensionado').select('orden_id')
        .not('orden_id', 'is', null).gte('creado_en', antes).lt('creado_en', fin),
    ])
    if (ords.error) {
      setError('No se pudo cargar el historial de ventas')
      setOrdenes([])
    } else {
      setOrdenes(ords.data ?? [])
    }
    setConCortes(new Set((proys.data ?? []).map(p => p.orden_id)))
    setAbierta(null)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [periodo, desde, hasta])

  const vendedores = useMemo(
    () => [...new Set(ordenes.map(o => o.vendedor?.nombre).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [ordenes]
  )

  // Base del período (y vendedor): de aquí salen las tarjetas
  const base = useMemo(
    () => ordenes.filter(o => filtroVendedor === '' || o.vendedor?.nombre === filtroVendedor),
    [ordenes, filtroVendedor]
  )
  const vigentes = base.filter(o => o.estado === 'aprobada')
  const anuladas = base.filter(o => o.estado === 'cancelada')

  const resumen = useMemo(() => {
    const planchas = vigentes.reduce((s, o) => s + o.cantidad, 0)
    const boletas = new Set(vigentes.map(o => o.nro_boleta)).size
    const nCortes = vigentes.filter(o => conCortes.has(o.id)).length
    const porTipo = {}
    vigentes.forEach(o => { const k = `${o.tipo?.nombre ?? 'Sin tipo'} ${o.tipo?.medida ?? ''}`.trim(); porTipo[k] = (porTipo[k] ?? 0) + o.cantidad })
    const top = Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0]
    const porVend = {}
    vigentes.forEach(o => { const k = o.vendedor?.nombre ?? '—'; porVend[k] = (porVend[k] ?? 0) + o.cantidad })
    const mejorVend = Object.entries(porVend).sort((a, b) => b[1] - a[1])[0]
    return {
      planchas, boletas, nCortes,
      pctCortes: vigentes.length ? Math.round((nCortes / vigentes.length) * 100) : 0,
      top, mejorVend,
      planchasAnuladas: anuladas.reduce((s, o) => s + o.cantidad, 0)
    }
  }, [vigentes, anuladas, conCortes])

  // Lista: además de lo anterior, búsqueda y filtro de cortes
  const q = busqueda.trim().toLowerCase()
  const lista = base.filter(o =>
    (verAnuladas || o.estado === 'aprobada') &&
    (filtroCortes === 'todas' || (filtroCortes === 'con') === conCortes.has(o.id)) &&
    (q === '' ||
      String(o.nro_boleta ?? '').includes(q) ||
      (o.cliente_nombre ?? '').toLowerCase().includes(q) ||
      (o.cliente_rut ?? '').toLowerCase().includes(q) ||
      (o.cliente_email ?? '').toLowerCase().includes(q) ||
      `${o.tipo?.nombre ?? ''} ${o.tipo?.medida ?? ''}`.toLowerCase().includes(q) ||
      (o.vendedor?.nombre ?? '').toLowerCase().includes(q))
  )

  const porDia = lista.reduce((acc, o) => {
    const k = diaDe(o.aprobado_en)
    if (!acc[k]) acc[k] = []
    acc[k].push(o)
    return acc
  }, {})

  const hayFiltro = q !== '' || filtroCortes !== 'todas' || filtroVendedor !== '' || verAnuladas

  async function anular(o) {
    if (!confirm('¿Anular esta venta? La orden quedará registrada como anulada y las planchas volverán al stock.')) return
    const { error: err } = await supabase.from('ordenes').update({ estado: 'cancelada' }).eq('id', o.id)
    if (err) { alert('No se pudo anular la venta'); return }
    await registrarLog({
      accion: 'ELIMINAR',
      entidad: 'orden',
      detalle: { orden_id: o.id, nro_boleta: o.nro_boleta, cantidad: o.cantidad, plancha: `${o.tipo?.nombre ?? ''} ${o.tipo?.medida ?? ''}`.trim() }
    }, profile)
    setOrdenes(prev => prev.map(x => (x.id === o.id ? { ...x, estado: 'cancelada' } : x)))
  }

  async function verCortes(o) {
    const { data } = await supabase.from('proyectos_dimensionado').select('*').eq('orden_id', o.id).order('creado_en', { ascending: false }).limit(1)
    if (!data?.length) { alert('No se encontró el proyecto de cortes de esta orden'); return }
    setVisor({ orden: o, proyecto: data[0] })
  }

  // ── Visor de los cortes de una venta ──
  if (visor) {
    const p = visor.proyecto
    const res = p.resultado
    const planchas = Array.isArray(res) ? res : (res?.planchas ?? [])
    const dims = Array.isArray(res) ? { w: PLANCHA_W_DEFAULT, h: PLANCHA_H_DEFAULT } : (res?.dims ?? { w: PLANCHA_W_DEFAULT, h: PLANCHA_H_DEFAULT })
    return (
      <div style={{ maxWidth: '1000px' }}>
        <button onClick={() => setVisor(null)}
          style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', marginBottom: '16px' }}>
          ← Volver al historial de ventas
        </button>
        <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '12px' }}>Cortes de la boleta <strong>#{visor.orden.nro_boleta}</strong></p>
        <EditorCortes key={p.id} soloLectura
          cliente={{ nombre: p.cliente_nombre, rut: p.cliente_rut ?? '', telefono: p.cliente_telefono ?? '', email: p.cliente_email ?? '' }}
          plancha={{ plancha_nombre: p.plancha_nombre, plancha_medida: p.plancha_medida }}
          inicial={{ piezas: Array.isArray(p.piezas) ? p.piezas : [], dims, planchas }} />
      </div>
    )
  }

  return (
    <div style={{ color: 'var(--text1)' }}>
      <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '14px' }}>
        Órdenes aprobadas con boleta. Elige el período y toca una fila para ver su detalle.
      </p>

      {/* Período */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {PERIODOS.map(p => <button key={p.key} style={chip(periodo === p.key)} onClick={() => setPeriodo(p.key)}>{p.label}</button>)}
      </div>
      {periodo === 'rango' && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text3)' }}>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ width: 'auto' }} />
          <label style={{ fontSize: '12px', color: 'var(--text3)' }}>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ width: 'auto' }} />
        </div>
      )}

      {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px' }}>{error}</p>}

      {periodo === 'rango' && !rango ? (
        <div style={{ ...card, padding: '30px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Elige las fechas “Desde” y “Hasta” para ver las ventas.</p>
        </div>
      ) : loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando historial...</p>
      ) : (
        <>
          {/* Tarjetas del período */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <Tarjeta icono="🟫" titulo="Planchas vendidas" valor={resumen.planchas} colorValor="var(--primary)"
              detalle={`en ${vigentes.length} orden${vigentes.length === 1 ? '' : 'es'}`} />
            <Tarjeta icono="🧾" titulo="Boletas emitidas" valor={resumen.boletas} detalle="en el período" />
            <Tarjeta icono="✂️" titulo="Órdenes con cortes" valor={resumen.nCortes}
              detalle={vigentes.length ? `${resumen.pctCortes}% de las órdenes` : 'sin órdenes'} />
            <Tarjeta icono="🏆" titulo="Más vendido" valor={resumen.top ? resumen.top[0] : '—'}
              detalle={resumen.top ? `${resumen.top[1]} planchas` : 'sin ventas'} />
            {vendedores.length > 1 && filtroVendedor === '' && (
              <Tarjeta icono="👤" titulo="Mejor vendedor" valor={resumen.mejorVend ? resumen.mejorVend[0] : '—'}
                detalle={resumen.mejorVend ? `${resumen.mejorVend[1]} planchas` : 'sin ventas'} />
            )}
            <Tarjeta icono="↩️" titulo="Anuladas" valor={anuladas.length} colorValor={anuladas.length > 0 ? 'var(--red)' : 'var(--text1)'}
              detalle={anuladas.length ? `${resumen.planchasAnuladas} planchas devueltas al stock` : 'ninguna'} />
          </div>

          {/* Filtros */}
          <div style={{ marginBottom: '10px' }}>
            <input type="text" placeholder="🔍 Buscar por boleta, cliente, RUT, plancha o vendedor..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '18px' }}>
            <button style={chip(filtroCortes === 'todas')} onClick={() => setFiltroCortes('todas')}>Todas</button>
            <button style={chip(filtroCortes === 'con')} onClick={() => setFiltroCortes('con')}>✂️ Con cortes</button>
            <button style={chip(filtroCortes === 'sin')} onClick={() => setFiltroCortes('sin')}>Sin cortes</button>
            {vendedores.length > 1 && (
              <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={{ width: 'auto', minWidth: '170px' }}>
                <option value="">Todos los vendedores</option>
                {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={verAnuladas} onChange={e => setVerAnuladas(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }} />
              Mostrar anuladas
            </label>
            {hayFiltro && (
              <button onClick={() => { setBusqueda(''); setFiltroCortes('todas'); setFiltroVendedor(''); setVerAnuladas(false) }}
                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: 500 }}>
                ✕ Limpiar filtros
              </button>
            )}
          </div>

          {/* Lista agrupada por día */}
          {lista.length === 0 ? (
            <div style={{ ...card, padding: '40px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text3)' }}>
                {hayFiltro ? 'No hay órdenes que coincidan con los filtros.' : 'No hay órdenes aprobadas en este período.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {Object.entries(porDia).map(([dia, items]) => {
                const vig = items.filter(o => o.estado === 'aprobada')
                return (
                  <div key={dia}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, textTransform: 'capitalize' }}>{etiquetaDia(dia)}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
                        {vig.length} orden{vig.length === 1 ? '' : 'es'} · {vig.reduce((s, o) => s + o.cantidad, 0)} planchas
                      </p>
                    </div>
                    <div style={{ ...card, overflow: 'hidden' }}>
                      {items.map((o, i) => {
                        const abiertaAhora = abierta === o.id
                        const anulada = o.estado === 'cancelada'
                        const tieneCortes = conCortes.has(o.id)
                        return (
                          <div key={o.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', opacity: anulada ? 0.65 : 1 }}>
                            <button onClick={() => setAbierta(abiertaAhora ? null : o.id)}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: abiertaAhora ? 'var(--bg3)' : 'transparent', border: 'none', textAlign: 'left', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '12px', color: 'var(--text3)', minWidth: '66px', whiteSpace: 'nowrap' }}>{horaDe(o.aprobado_en)}</span>
                              <span style={{ background: 'var(--primary-soft)', color: 'var(--primary)', fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '8px' }}>#{o.nro_boleta}</span>
                              <span style={{ flex: 1, minWidth: '180px' }}>
                                <span style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'var(--text1)' }}>
                                  {o.cliente_nombre || <span style={{ color: 'var(--text3)' }}>Sin datos del cliente</span>}
                                </span>
                                <span style={{ display: 'block', fontSize: '12px', color: 'var(--text3)' }}>
                                  {o.cantidad} × {o.tipo?.nombre} {o.tipo?.medida} · {o.vendedor?.nombre}
                                </span>
                              </span>
                              {tieneCortes
                                ? <span style={{ background: 'var(--info-soft)', color: 'var(--info)', fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px' }}>✂️ Con cortes</span>
                                : <span style={{ color: 'var(--text3)', fontSize: '11px' }}>Sin cortes</span>}
                              {anulada && <span style={{ background: 'var(--red-soft)', color: 'var(--red)', fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px' }}>Anulada</span>}
                              <span style={{ color: 'var(--text3)', fontSize: '12px' }}>{abiertaAhora ? '▲' : '▼'}</span>
                            </button>

                            {abiertaAhora && (
                              <div style={{ padding: '14px 16px 16px', background: 'var(--bg3)', borderTop: '1px solid var(--border)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                                  <Dato titulo="Cliente">
                                    {o.cliente_nombre || '—'}
                                    {o.cliente_rut && <span style={{ display: 'block', color: 'var(--text3)', fontSize: '12px' }}>RUT {o.cliente_rut}</span>}
                                    {o.telefono_cliente && <span style={{ display: 'block', color: 'var(--text3)', fontSize: '12px' }}>📞 {o.telefono_cliente}</span>}
                                    {o.cliente_email && <span style={{ display: 'block', color: 'var(--text3)', fontSize: '12px' }}>✉️ {o.cliente_email}</span>}
                                  </Dato>
                                  <Dato titulo="Plancha">{o.cantidad} × {o.tipo?.nombre} {o.tipo?.medida}
                                    {o.tipo?.categoria && <span style={{ display: 'block', color: 'var(--text3)', fontSize: '12px' }}>{o.tipo.categoria}</span>}
                                  </Dato>
                                  <Dato titulo="Venta">
                                    Vendedor: {o.vendedor?.nombre ?? '—'}
                                    <span style={{ display: 'block', color: 'var(--text3)', fontSize: '12px' }}>Aprobó: {o.aprobador?.nombre ?? '—'}</span>
                                    <span style={{ display: 'block', color: 'var(--text3)', fontSize: '12px' }}>{new Date(o.aprobado_en).toLocaleString('es-CL', { timeZone: TZ })}</span>
                                  </Dato>
                                  {o.fecha_agendada && (
                                    <Dato titulo="Día de taller">{new Date(o.fecha_agendada + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</Dato>
                                  )}
                                  {o.orden_servicios?.length > 0 && (
                                    <Dato titulo="Servicios">{o.orden_servicios.map(s => s.tipo?.nombre).filter(Boolean).join(', ')}</Dato>
                                  )}
                                  {o.nota && <Dato titulo="Nota">{o.nota}</Dato>}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {tieneCortes && (
                                    <button onClick={() => verCortes(o)}
                                      style={{ background: 'var(--primary-soft)', color: 'var(--primary)', border: '1px solid rgba(227,6,19,0.35)', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 500 }}>
                                      ✂️ Ver cortes
                                    </button>
                                  )}
                                  {esAdmin && !anulada && (
                                    <button onClick={() => anular(o)}
                                      style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)', borderRadius: '8px', padding: '7px 14px', fontSize: '12px' }}>
                                      Anular venta
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
