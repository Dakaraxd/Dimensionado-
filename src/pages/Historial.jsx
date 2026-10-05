import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { registrarLog } from '../lib/logger'
import { aYMD } from '../lib/fechas'

export default function Historial() {
  const { profile } = useAuth()
  const [vista, setVista] = useState('meses')
  const [mesSeleccionado, setMesSeleccionado] = useState(null)
  const [diaSeleccionado, setDiaSeleccionado] = useState(null)
  const [boletaSeleccionada, setBoletaSeleccionada] = useState(null)
  const [ordenes, setOrdenes] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchTodo() {
    // Últimos 12 meses: evita cargar toda la historia en memoria
    const desde = new Date()
    desde.setFullYear(desde.getFullYear() - 1)
    const { data } = await supabase
      .from('ordenes')
      .select(`
        *,
        vendedor:profiles!vendedor_id(nombre),
        aprobador:profiles!aprobado_por(nombre),
        tipo:tipos_plancha!tipo_plancha_id(nombre, medida, categoria)
      `)
      .eq('estado', 'aprobada')
      .gte('aprobado_en', `${aYMD(desde)}T00:00:00`)
      .order('aprobado_en', { ascending: false })
    setOrdenes(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTodo() }, [])

  async function handleEliminar(orden) {
    if (!confirm('¿Anular esta venta del historial? La orden quedará registrada como cancelada.')) return
    // Anulación lógica: borrar físicamente destruye el respaldo de la venta
    // (asociado a una boleta) y descuadra el stock vendido.
    const { error } = await supabase.from('ordenes').update({ estado: 'cancelada' }).eq('id', orden.id)
    if (error) { alert('Error al anular la orden'); return }
    await registrarLog({
      accion: 'ELIMINAR',
      entidad: 'orden',
      detalle: {
        orden_id: orden.id,
        nro_boleta: orden.nro_boleta,
        cantidad: orden.cantidad,
        plancha: orden.tipo?.nombre + ' ' + orden.tipo?.medida
      }
    }, profile)
    const nuevasOrdenes = ordenes.filter(o => o.id !== orden.id)
    setOrdenes(nuevasOrdenes)
    const restantes = nuevasOrdenes.filter(o => o.nro_boleta === boletaSeleccionada)
    if (restantes.length === 0) { setBoletaSeleccionada(null); setVista('boletas') }
  }

  const porMes = ordenes.reduce((acc, o) => {
    const fecha = new Date(o.aprobado_en)
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  const ordenesDelMes = mesSeleccionado ? (porMes[mesSeleccionado] ?? []) : []
  const porDia = ordenesDelMes.reduce((acc, o) => {
    const fecha = new Date(o.aprobado_en)
    const key = fecha.getDate()
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  const ordenesDelDia = diaSeleccionado ? (porDia[diaSeleccionado] ?? []) : []
  const porBoleta = ordenesDelDia.reduce((acc, o) => {
    const key = o.nro_boleta ?? 'sin-boleta'
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  const nombreMes = (key) => {
    const [year, month] = key.split('-')
    return new Date(year, month - 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  }

  if (loading) return <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando historial...</p>

  return (
    <div style={{ color: 'var(--text1)' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button onClick={() => { setVista('meses'); setMesSeleccionado(null); setDiaSeleccionado(null); setBoletaSeleccionada(null) }}
          style={{ background: 'transparent', border: 'none', fontWeight: '500', cursor: 'pointer', color: vista === 'meses' ? 'var(--text1)' : 'var(--primary)', fontSize: '13px' }}>
          Historial
        </button>
        {mesSeleccionado && <>
          <span style={{ color: 'var(--text3)' }}>/</span>
          <button onClick={() => { setVista('dias'); setDiaSeleccionado(null); setBoletaSeleccionada(null) }}
            style={{ background: 'transparent', border: 'none', fontWeight: '500', cursor: 'pointer', color: vista === 'dias' ? 'var(--text1)' : 'var(--primary)', fontSize: '13px', textTransform: 'capitalize' }}>
            {nombreMes(mesSeleccionado)}
          </button>
        </>}
        {diaSeleccionado && <>
          <span style={{ color: 'var(--text3)' }}>/</span>
          <button onClick={() => { setVista('boletas'); setBoletaSeleccionada(null) }}
            style={{ background: 'transparent', border: 'none', fontWeight: '500', cursor: 'pointer', color: vista === 'boletas' ? 'var(--text1)' : 'var(--primary)', fontSize: '13px' }}>
            Día {diaSeleccionado}
          </button>
        </>}
        {boletaSeleccionada && <>
          <span style={{ color: 'var(--text3)' }}>/</span>
          <span style={{ fontWeight: '500', color: 'var(--text1)' }}>Boleta #{boletaSeleccionada}</span>
        </>}
      </div>

      {/* VISTA MESES */}
      {vista === 'meses' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '500' }}>Historial de ventas</h2>
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{Object.keys(porMes).length} meses</p>
          </div>
          {Object.keys(porMes).length === 0 ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text3)' }}>No hay ventas registradas aún.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
              {Object.entries(porMes).map(([key, items]) => {
                const total = items.reduce((sum, o) => sum + o.cantidad, 0)
                const boletas = new Set(items.map(o => o.nro_boleta)).size
                return (
                  <button key={key} onClick={() => { setMesSeleccionado(key); setVista('dias') }}
                    style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', textAlign: 'left', cursor: 'pointer' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>{key.split('-')[0]}</p>
                    <h3 style={{ fontSize: '18px', fontWeight: '500', color: 'var(--text1)', textTransform: 'capitalize', marginBottom: '12px' }}>
                      {new Date(key.split('-')[0], key.split('-')[1] - 1).toLocaleDateString('es-CL', { month: 'long' })}
                    </h3>
                    <p style={{ fontSize: '26px', fontWeight: '500', color: 'var(--primary)', marginBottom: '2px' }}>{total}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)' }}>planchas vendidas</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{boletas} boleta{boletas !== 1 ? 's' : ''}</p>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* VISTA DÍAS */}
      {vista === 'dias' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '500', textTransform: 'capitalize' }}>{nombreMes(mesSeleccionado)}</h2>
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{ordenesDelMes.reduce((sum, o) => sum + o.cantidad, 0)} planchas</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.entries(porDia).sort(([a], [b]) => b - a).map(([dia, items]) => {
              const total = items.reduce((sum, o) => sum + o.cantidad, 0)
              const boletas = new Set(items.map(o => o.nro_boleta)).size
              const fecha = new Date(items[0].aprobado_en)
              return (
                <button key={dia} onClick={() => { setDiaSeleccionado(parseInt(dia)); setVista('boletas') }}
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ background: 'var(--primary-soft)', color: 'var(--primary)', fontWeight: '500', fontSize: '20px', width: '48px', height: '48px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {dia}
                    </div>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text1)', textTransform: 'capitalize' }}>
                        {fecha.toLocaleDateString('es-CL', { weekday: 'long' })}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{boletas} boleta{boletas !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '22px', fontWeight: '500', color: 'var(--text1)' }}>{total}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)' }}>planchas</p>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* VISTA BOLETAS */}
      {vista === 'boletas' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '500' }}>Día {diaSeleccionado} — {nombreMes(mesSeleccionado)}</h2>
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{ordenesDelDia.reduce((sum, o) => sum + o.cantidad, 0)} planchas</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.entries(porBoleta).map(([boleta, items]) => {
              const total = items.reduce((sum, o) => sum + o.cantidad, 0)
              const vendedor = items[0]?.vendedor?.nombre
              const hora = new Date(items[0]?.aprobado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
              return (
                <button key={boleta} onClick={() => { setBoletaSeleccionada(boleta); setVista('detalle') }}
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ background: 'var(--primary)', color: '#fff', fontWeight: '500', fontSize: '11px', padding: '6px 10px', borderRadius: '8px' }}>
                      #{boleta}
                    </div>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text1)' }}>{total} plancha{total !== 1 ? 's' : ''}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{vendedor} · {hora}</p>
                    </div>
                  </div>
                  <span style={{ color: 'var(--text3)', fontSize: '18px' }}>›</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* VISTA DETALLE */}
      {vista === 'detalle' && boletaSeleccionada && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '500' }}>Boleta #{boletaSeleccionada}</h2>
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
                {new Date(porBoleta[boletaSeleccionada]?.[0]?.aprobado_en).toLocaleString('es-CL')}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '4px' }}>
                Vendedor: <span style={{ fontWeight: '500', color: 'var(--text1)' }}>{porBoleta[boletaSeleccionada]?.[0]?.vendedor?.nombre}</span>
              </p>
              {porBoleta[boletaSeleccionada]?.[0]?.aprobador?.nombre !== porBoleta[boletaSeleccionada]?.[0]?.vendedor?.nombre && (
                <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '2px' }}>
                  Aprobó: <span style={{ fontWeight: '500', color: 'var(--text1)' }}>{porBoleta[boletaSeleccionada]?.[0]?.aprobador?.nombre}</span>
                </p>
              )}
            </div>

            {porBoleta[boletaSeleccionada]?.map(o => (
              <div key={o.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ background: 'var(--primary-soft)', color: 'var(--primary)', fontSize: '11px', fontWeight: '500', padding: '2px 8px', borderRadius: '99px' }}>
                    {o.tipo?.categoria}
                  </span>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text1)' }}>{o.tipo?.nombre}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{o.tipo?.medida}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '500', color: 'var(--text1)' }}>× {o.cantidad}</span>
                  {profile?.rol === 'administrador' && (
                    <button onClick={() => handleEliminar(o)}
                      style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
                      Anular
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div style={{ padding: '12px 20px', background: 'var(--bg3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Total</span>
              <span style={{ fontSize: '18px', fontWeight: '500', color: 'var(--text1)' }}>
                {porBoleta[boletaSeleccionada]?.reduce((sum, o) => sum + o.cantidad, 0)} planchas
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}