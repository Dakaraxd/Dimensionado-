import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { registrarLog } from '../lib/logger'
import { hoyChile, aYMD } from '../lib/fechas'

export default function Ordenes({ onCortar }) {
  const { profile } = useAuth()
  const [ordenes, setOrdenes] = useState([])
  const [stocks, setStocks] = useState([])
  const [servicios, setServicios] = useState([])
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState([])
  const [cuotaInfo, setCuotaInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [aprobando, setAprobando] = useState(null)
  const [boleta, setBoleta] = useState('')
  const [form, setForm] = useState({ tipo_plancha_id: '', cantidad: '', nota: '', telefono_cliente: '' })
  const [diasDisponibles, setDiasDisponibles] = useState([])
  const [fechaElegida, setFechaElegida] = useState(null)
  const [loadingDias, setLoadingDias] = useState(false)
  const [ordenCreada, setOrdenCreada] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const hoy = hoyChile()
  const puedeOperar = profile?.rol === 'administrador' || profile?.rol === 'vendedor'

  useEffect(() => { fetchOrdenes(); fetchStocks(); fetchCuota(); fetchServicios() }, [])

  async function fetchCuota() {
    const { data } = await supabase
      .from('vista_dias_mes')
      .select('*')
      .eq('fecha', hoy)
      .maybeSingle()
    if (data) {
      setCuotaInfo({
        cuota: data.cuota,
        dimensionadores: data.dimensionadores,
        agendadas: data.agendadas,
        disponible: data.cupo_disponible
      })
    } else {
      setCuotaInfo(null)
    }
  }

  async function fetchOrdenes() {
    const { data } = await supabase
      .from('ordenes')
      .select(`
        *,
        vendedor:profiles!vendedor_id(nombre),
        aprobador:profiles!aprobado_por(nombre),
        tipo:tipos_plancha!tipo_plancha_id(nombre, medida, categoria),
        orden_servicios(
          id,
          tipo:tipos_plancha!tipo_plancha_id(nombre, medida)
        )
      `)
      .eq('estado', 'pendiente')
      .order('fecha_agendada', { ascending: true })
      .order('creado_en', { ascending: true })
    setOrdenes(data ?? [])
    setLoading(false)
  }

  async function fetchStocks() {
    const { data } = await supabase
      .from('vista_stock_general')
      .select('*')
      .gt('disponible', 0)
      .not('plancha_categoria', 'in', '("Servicios","Otros")')
      .order('plancha_nombre')
    setStocks(data ?? [])
  }

  async function fetchServicios() {
    const { data } = await supabase
      .from('tipos_plancha')
      .select('*')
      .eq('activo', true)
      .eq('categoria', 'Servicios')
      .order('nombre')
    setServicios(data ?? [])
  }

  function toggleServicio(id) {
    setServiciosSeleccionados(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  async function calcularDiasDisponibles(cantidad) {
    if (!cantidad || parseInt(cantidad) <= 0) {
      setDiasDisponibles([])
      setFechaElegida(null)
      return
    }
    setLoadingDias(true)
    setFechaElegida(null)

    const cant = parseInt(cantidad)
    const hasta = new Date()
    hasta.setDate(hasta.getDate() + 30)
    const hastaStr = aYMD(hasta)

    const { data } = await supabase
      .from('vista_dias_mes')
      .select('*')
      .gte('fecha', hoy)
      .lte('fecha', hastaStr)
      .order('fecha')

    const disponibles = (data ?? []).map(d => ({
      ...d,
      cabe: d.cupo_disponible >= cant
    }))

    setDiasDisponibles(disponibles)
    const primero = disponibles.find(d => d.cabe)
    if (primero) setFechaElegida(primero.fecha)
    setLoadingDias(false)
  }

  async function handleCrear(e) {
    e.preventDefault()
    setError('')
    if (!fechaElegida) { setError('Selecciona un día para agendar la orden'); return }
    setGuardando(true)

    const stockSeleccionado = stocks.find(s => s.tipo_plancha_id === form.tipo_plancha_id)
    if (!stockSeleccionado) { setError('Selecciona una plancha'); setGuardando(false); return }
    if (parseInt(form.cantidad) > stockSeleccionado.disponible) {
      setError(`Solo hay ${stockSeleccionado.disponible} planchas disponibles en stock`)
      setGuardando(false)
      return
    }

    const { data: ordenData, error } = await supabase.from('ordenes').insert({
      tipo_plancha_id: form.tipo_plancha_id,
      stock_id: null,
      cantidad: parseInt(form.cantidad),
      nota: form.nota,
      telefono_cliente: form.telefono_cliente,
      fecha_agendada: fechaElegida,
      vendedor_id: profile.id
    }).select().single()

    if (error) {
      setError('Error al crear la orden')
    } else {
      // Guardar servicios seleccionados
      if (serviciosSeleccionados.length > 0) {
        await supabase.from('orden_servicios').insert(
          serviciosSeleccionados.map(sid => ({
            orden_id: ordenData.id,
            tipo_plancha_id: sid
          }))
        )
      }

      await registrarLog({
        accion: 'CREAR',
        entidad: 'orden',
        detalle: {
          cantidad: parseInt(form.cantidad),
          plancha: stockSeleccionado.plancha_nombre + ' ' + stockSeleccionado.plancha_medida,
          fecha_agendada: fechaElegida,
          nota: form.nota,
          servicios: serviciosSeleccionados.length > 0
            ? servicios.filter(s => serviciosSeleccionados.includes(s.id)).map(s => s.nombre).join(', ')
            : null
        }
      }, profile)

      setOrdenCreada({ fecha: fechaElegida, cantidad: parseInt(form.cantidad), plancha: stockSeleccionado })
      setForm({ tipo_plancha_id: '', cantidad: '', nota: '', telefono_cliente: '' })
      setServiciosSeleccionados([])
      setDiasDisponibles([])
      setFechaElegida(null)
      setShowForm(false)
      fetchOrdenes()
      fetchStocks()
      fetchCuota()
    }
    setGuardando(false)
  }

  async function handleAprobar(orden) {
    if (!boleta.trim()) { setError('Ingresa el número de boleta'); return }
    setGuardando(true)
    setError('')
    const { error } = await supabase
      .from('ordenes')
      .update({ estado: 'aprobada', nro_boleta: boleta.trim(), aprobado_por: profile.id })
      .eq('id', orden.id)
    if (error) {
      setError('Error al aprobar la orden')
    } else {
      await registrarLog({
        accion: 'APROBAR',
        entidad: 'orden',
        detalle: {
          orden_id: orden.id,
          nro_boleta: boleta.trim(),
          cantidad: orden.cantidad,
          plancha: orden.tipo?.nombre + ' ' + orden.tipo?.medida
        }
      }, profile)
      setAprobando(null)
      setBoleta('')
      fetchOrdenes()
      fetchStocks()
      fetchCuota()

      if (onCortar && confirm('¿El cliente realizará cortes a sus planchas?')) {
        onCortar({ telefono: orden.telefono_cliente, tipo_plancha_id: orden.tipo_plancha_id })
      }
    }
    setGuardando(false)
  }

  async function handleCancelar(orden) {
    if (!confirm('¿Cancelar esta orden?')) return
    const { error } = await supabase.from('ordenes').update({ estado: 'cancelada' }).eq('id', orden.id)
    if (error) { setError('Error al cancelar la orden'); return }
    await registrarLog({
      accion: 'CANCELAR',
      entidad: 'orden',
      detalle: {
        orden_id: orden.id,
        cantidad: orden.cantidad,
        plancha: orden.tipo?.nombre + ' ' + orden.tipo?.medida,
        fecha_agendada: orden.fecha_agendada
      }
    }, profile)
    fetchOrdenes()
    fetchStocks()
    fetchCuota()
  }

  const formatFecha = (fecha) => {
    if (!fecha) return ''
    if (fecha === hoy) return 'Hoy'
    return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const porFecha = ordenes.reduce((acc, o) => {
    const key = o.fecha_agendada ?? hoy
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px' }}>Órdenes pendientes</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{ordenes.length} orden{ordenes.length !== 1 ? 'es' : ''} en espera</p>
        </div>
        {puedeOperar && (
          <button onClick={() => { setShowForm(!showForm); setError(''); setDiasDisponibles([]); setFechaElegida(null); setOrdenCreada(null); setServiciosSeleccionados([]) }}
            style={{ background: showForm ? 'var(--bg3)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500' }}>
            {showForm ? 'Cancelar' : '+ Nueva orden'}
          </button>
        )}
      </div>

      {cuotaInfo ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Dimensionadores</p>
            <p style={{ fontSize: '22px', fontWeight: '500' }}>{cuotaInfo.dimensionadores}</p>
          </div>
          <div>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Cuota del día</p>
            <p style={{ fontSize: '22px', fontWeight: '500', color: 'var(--primary)' }}>{cuotaInfo.cuota}</p>
          </div>
          <div>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Agendadas</p>
            <p style={{ fontSize: '22px', fontWeight: '500', color: 'var(--amber)' }}>{cuotaInfo.agendadas}</p>
          </div>
          <div>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Cupo disponible</p>
            <p style={{ fontSize: '22px', fontWeight: '500', color: cuotaInfo.disponible > 0 ? 'var(--green)' : 'var(--red)' }}>
              {cuotaInfo.disponible}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--amber-soft)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', color: 'var(--amber)' }}>⚠️ No hay dimensionadores planificados para hoy. El admin debe configurarlos en el <strong>📅 Tablero</strong>.</p>
        </div>
      )}

      {ordenCreada && (
        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--green)', marginBottom: '4px' }}>✓ Orden creada correctamente</p>
            <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
              <strong>{ordenCreada.cantidad} planchas</strong> de {ordenCreada.plancha?.plancha_nombre} {ordenCreada.plancha?.plancha_medida} quedan agendadas para:{' '}
              <strong style={{ color: ordenCreada.fecha === hoy ? 'var(--green)' : 'var(--amber)' }}>
                {ordenCreada.fecha === hoy ? 'hoy' : new Date(ordenCreada.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </strong>
            </p>
            {ordenCreada.fecha !== hoy && (
              <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>📞 Recuerda notificar al cliente</p>
            )}
          </div>
          <button onClick={() => setOrdenCreada(null)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {showForm && puedeOperar && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '500', marginBottom: '16px' }}>Nueva orden</h3>
          {stocks.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--amber)' }}>No hay stock disponible.</p>
          ) : (
            <form onSubmit={handleCrear} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Tipo de plancha</label>
                  <select required value={form.tipo_plancha_id} onChange={e => setForm({ ...form, tipo_plancha_id: e.target.value })}>
                    <option value="">Selecciona...</option>
                    {stocks.map(s => (
                      <option key={s.tipo_plancha_id} value={s.tipo_plancha_id}>
                        {s.plancha_nombre} {s.plancha_medida} — {s.disponible} disp.
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Cantidad</label>
                  <input
                    type="number" required min="1" value={form.cantidad}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '')
                      setForm({ ...form, cantidad: val })
                      calcularDiasDisponibles(val)
                    }}
                    onKeyDown={e => {
                      if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault()
                    }}
                    placeholder="Ej: 10"
                    step="1"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Teléfono cliente</label>
                  <input type="tel" value={form.telefono_cliente} onChange={e => setForm({ ...form, telefono_cliente: e.target.value })} placeholder="+56 9 1234 5678" />
                  <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>🔒 Solo para avisar sobre esta orden (Ley 19.628 / 21.719)</p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Nota (opcional)</label>
                  <input type="text" value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} placeholder="Ej: Nombre del cliente" />
                </div>
              </div>

              {/* Servicios adicionales */}
              {servicios.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px', fontWeight: '500' }}>
                    Servicios adicionales (opcional)
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {servicios.map(s => {
                      const seleccionado = serviciosSeleccionados.includes(s.id)
                      return (
                        <button key={s.id} type="button" onClick={() => toggleServicio(s.id)}
                          style={{
                            padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                            border: `1px solid ${seleccionado ? 'var(--primary)' : 'var(--border)'}`,
                            background: seleccionado ? 'var(--primary-soft)' : 'var(--bg3)',
                            color: seleccionado ? 'var(--primary)' : 'var(--text2)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                          }}>
                          <span style={{
                            width: '14px', height: '14px', borderRadius: '3px',
                            border: `1.5px solid ${seleccionado ? 'var(--primary)' : 'var(--text3)'}`,
                            background: seleccionado ? 'var(--primary)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '9px', color: '#fff', flexShrink: 0
                          }}>
                            {seleccionado ? '✓' : ''}
                          </span>
                          {s.nombre}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Selector de días */}
              {form.cantidad > 0 && (
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>
                    {loadingDias ? 'Calculando días...' : 'Selecciona el día para agendar:'}
                  </p>
                  {!loadingDias && diasDisponibles.filter(d => d.cuota).length === 0 && (
                    <div style={{ background: 'var(--amber-soft)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', padding: '12px 16px' }}>
                      <p style={{ fontSize: '13px', color: 'var(--amber)' }}>⚠️ No hay días planificados. El administrador debe asignar dimensionadores en el <strong>📅 Tablero</strong>.</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {diasDisponibles.filter(d => d.cuota).map(d => (
                      <button key={d.fecha} type="button" onClick={() => { if (d.cabe) setFechaElegida(d.fecha) }}
                        style={{
                          padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: '500',
                          border: `1px solid ${fechaElegida === d.fecha ? 'var(--primary)' : d.cabe ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.3)'}`,
                          background: fechaElegida === d.fecha ? 'var(--primary)' : d.cabe ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.06)',
                          color: fechaElegida === d.fecha ? '#fff' : d.cabe ? 'var(--green)' : 'var(--red)',
                          cursor: d.cabe ? 'pointer' : 'not-allowed', opacity: d.cabe ? 1 : 0.6
                        }}>
                        <div>{d.fecha === hoy ? 'Hoy' : new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                        <div style={{ fontSize: '10px', marginTop: '2px', opacity: 0.8 }}>
                          {d.agendadas}/{d.cuota} · {d.cabe ? `${d.cupo_disponible} libre` : 'Sin cupo'}
                        </div>
                      </button>
                    ))}
                  </div>
                  {!loadingDias && diasDisponibles.filter(d => d.cuota).length > 0 && !diasDisponibles.some(d => d.cabe) && (
                    <div style={{ background: 'var(--red-soft)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px 16px', marginTop: '10px' }}>
                      <p style={{ fontSize: '13px', color: 'var(--red)' }}>⚠️ Ningún día tiene cupo para {form.cantidad} planchas. El administrador debe planificar más días en el <strong>📅 Tablero</strong>.</p>
                    </div>
                  )}
                  {fechaElegida && (
                    <p style={{ fontSize: '12px', color: fechaElegida === hoy ? 'var(--green)' : 'var(--amber)', marginTop: '10px' }}>
                      📅 Se agendará para: <strong>{formatFecha(fechaElegida)}</strong>
                      {fechaElegida !== hoy && ' — recuerda notificar al cliente'}
                    </p>
                  )}
                </div>
              )}

              {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px' }}>{error}</p>}

              <button type="submit" disabled={guardando || !fechaElegida}
                style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: '500', opacity: (guardando || !fechaElegida) ? 0.5 : 1, alignSelf: 'flex-start' }}>
                {guardando ? 'Creando...' : 'Crear orden'}
              </button>
            </form>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando órdenes...</p>
      ) : ordenes.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text3)' }}>No hay órdenes pendientes.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {Object.entries(porFecha).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, items]) => {
            const totalFecha = items.reduce((sum, o) => sum + o.cantidad, 0)
            const esHoyFecha = fecha === hoy
            return (
              <div key={fecha}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ background: esHoyFecha ? 'var(--primary)' : 'var(--bg3)', color: esHoyFecha ? '#fff' : 'var(--text2)', borderRadius: '8px', padding: '4px 12px', fontSize: '13px', fontWeight: '500' }}>
                    {formatFecha(fecha)}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{totalFecha} planchas agendadas</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map(o => (
                    <div key={o.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: '11px', fontWeight: '500', padding: '3px 8px', borderRadius: '99px' }}>Pendiente</span>
                          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{new Date(o.creado_en).toLocaleString('es-CL')}</span>
                          <span style={{ fontSize: '11px', fontWeight: '500', color: o.fecha_agendada === hoy ? 'var(--green)' : 'var(--amber)', background: o.fecha_agendada === hoy ? 'var(--green-soft)' : 'var(--amber-soft)', padding: '2px 8px', borderRadius: '99px' }}>
                            📅 {formatFecha(o.fecha_agendada)}
                          </span>
                        </div>
                        <p style={{ fontSize: '15px', fontWeight: '500', marginBottom: '6px' }}>
                          {o.tipo?.nombre} {o.tipo?.medida}
                          <span style={{ color: 'var(--primary)', marginLeft: '8px' }}>{o.cantidad} planchas</span>
                        </p>

                        {/* Servicios de la orden */}
                        {o.orden_servicios?.length > 0 && (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                            {o.orden_servicios.map(os => (
                              <span key={os.id} style={{
                                background: 'rgba(139,92,246,0.12)', color: '#6d28d9',
                                border: '1px solid rgba(139,92,246,0.3)',
                                fontSize: '11px', padding: '2px 8px', borderRadius: '99px'
                              }}>
                                🔧 {os.tipo?.nombre}
                              </span>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          {o.telefono_cliente && <p style={{ fontSize: '12px', color: 'var(--text3)' }}>📞 <span style={{ color: 'var(--text2)' }}>{o.telefono_cliente}</span></p>}
                          {o.nota && <p style={{ fontSize: '12px', color: 'var(--text3)' }}>📝 <span style={{ color: 'var(--text2)' }}>{o.nota}</span></p>}
                          <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Vendedor: <span style={{ color: 'var(--text2)' }}>{o.vendedor?.nombre}</span></p>
                        </div>
                      </div>
                      {puedeOperar && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '140px' }}>
                          {aprobando === o.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <input type="text" placeholder="Nº boleta" value={boleta}
                                onChange={e => setBoleta(e.target.value.replace(/[^0-9]/g, ''))}
                                onKeyDown={e => { if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault() }}
                                autoFocus
                                style={{ width: '140px', padding: '6px 10px', fontSize: '13px' }} />
                              {error && <p style={{ fontSize: '11px', color: 'var(--red)' }}>{error}</p>}
                              <button onClick={() => handleAprobar(o)} disabled={guardando}
                                style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: '500' }}>
                                {guardando ? 'Aprobando...' : '✓ Confirmar'}
                              </button>
                              <button onClick={() => { setAprobando(null); setBoleta(''); setError('') }}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '12px' }}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => { setAprobando(o.id); setError('') }}
                                style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: '500' }}>
                                ✓ Aprobar con boleta
                              </button>
                              <button onClick={() => handleCancelar(o)}
                                style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)', borderRadius: '8px', padding: '7px 12px', fontSize: '12px' }}>
                                ✗ Cancelar orden
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}