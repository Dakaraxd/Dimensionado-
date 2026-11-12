import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { registrarLog } from '../lib/logger'
import { hoyChile } from '../lib/fechas'

// Bandeja de órdenes pendientes de boleta. Las ventas nuevas se registran y aprueban de una
// vez en "Nueva orden"; aquí quedan las que no alcanzaron a aprobarse.
export default function Ordenes({ onNuevaVenta }) {
  const { profile } = useAuth()
  const [ordenes, setOrdenes] = useState([])
  const [cuotaInfo, setCuotaInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [aprobando, setAprobando] = useState(null)
  const [boleta, setBoleta] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const hoy = hoyChile()
  const puedeOperar = profile?.rol === 'administrador' || profile?.rol === 'vendedor'

  useEffect(() => { fetchOrdenes(); fetchCuota() }, [])

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
      fetchCuota()
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
    fetchCuota()
  }

  const formatFecha = (fecha) => {
    if (!fecha || fecha === 'sin-dia') return 'Sin día de taller'
    if (fecha === hoy) return 'Hoy'
    return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const porFecha = ordenes.reduce((acc, o) => {
    const key = o.fecha_agendada ?? 'sin-dia'
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px' }}>Registro de salida</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{ordenes.length} orden{ordenes.length !== 1 ? 'es' : ''} en espera de boleta</p>
        </div>
        {puedeOperar && onNuevaVenta && (
          <button onClick={onNuevaVenta}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500' }}>
            + Nueva orden
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
        <div style={{ background: 'var(--amber-soft)', border: '1px solid rgba(180,83,9,0.3)', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', color: 'var(--amber)' }}>⚠️ No hay dimensionadores planificados para hoy. El admin debe configurarlos en el <strong>📅 Planificador</strong>.</p>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando órdenes...</p>
      ) : ordenes.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text3)' }}>No hay órdenes en espera.</p>
          <p style={{ color: 'var(--text3)', fontSize: '12px', marginTop: '6px' }}>Si un cliente se demora en pagar, en “Nueva orden” usa “Dejar en espera” y la orden quedará aquí hasta que traiga la boleta.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {Object.entries(porFecha).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, items]) => {
            const totalFecha = items.reduce((sum, o) => sum + o.cantidad, 0)
            const esHoyFecha = fecha === hoy
            return (
              <div key={fecha}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ background: esHoyFecha ? 'var(--primary)' : 'var(--bg3)', color: esHoyFecha ? '#fff' : 'var(--text2)', borderRadius: '8px', padding: '4px 12px', fontSize: '13px', fontWeight: '500', textTransform: 'capitalize' }}>
                    {formatFecha(fecha)}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{totalFecha} planchas</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map(o => (
                    <div key={o.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: '11px', fontWeight: '500', padding: '3px 8px', borderRadius: '99px' }}>En espera</span>
                          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{new Date(o.creado_en).toLocaleString('es-CL')}</span>
                        </div>
                        <p style={{ fontSize: '15px', fontWeight: '500', marginBottom: '6px' }}>
                          {o.tipo?.nombre} {o.tipo?.medida}
                          <span style={{ color: 'var(--primary)', marginLeft: '8px' }}>{o.cantidad} planchas</span>
                        </p>

                        {o.orden_servicios?.length > 0 && (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                            {o.orden_servicios.map(os => (
                              <span key={os.id} style={{ background: 'rgba(124,58,237,0.1)', color: '#6d28d9', border: '1px solid rgba(124,58,237,0.3)', fontSize: '11px', padding: '2px 8px', borderRadius: '99px' }}>
                                🔧 {os.tipo?.nombre}
                              </span>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          {o.cliente_nombre && <p style={{ fontSize: '12px', color: 'var(--text3)' }}>👤 <span style={{ color: 'var(--text2)' }}>{o.cliente_nombre}</span></p>}
                          {o.telefono_cliente && <p style={{ fontSize: '12px', color: 'var(--text3)' }}>📞 <span style={{ color: 'var(--text2)' }}>{o.telefono_cliente}</span></p>}
                          {o.cliente_email && <p style={{ fontSize: '12px', color: 'var(--text3)' }}>✉️ <span style={{ color: 'var(--text2)' }}>{o.cliente_email}</span></p>}
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
