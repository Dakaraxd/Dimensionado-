import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { hoyChile, aYMD } from '../lib/fechas'

export default function Tablero() {
  const { profile } = useAuth()
  const [dias, setDias] = useState([])
  const [ordenesPorFecha, setOrdenesPorFecha] = useState({})
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(() => {
    const hoy = new Date()
    return { year: hoy.getFullYear(), month: hoy.getMonth() }
  })
  const [editando, setEditando] = useState(null)
  const [expandido, setExpandido] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const esAdmin = profile?.rol === 'administrador'
  // Los datos de contacto de clientes solo los ve quien opera órdenes
  const puedeVerContacto = esAdmin || profile?.rol === 'vendedor'
  const hoy = hoyChile()

  useEffect(() => { fetchDias(); fetchOrdenes() }, [mes])

  async function fetchDias() {
    setLoading(true)
    const primerDia = new Date(mes.year, mes.month, 1)
    const ultimoDia = new Date(mes.year, mes.month + 1, 0)
    const desde = aYMD(primerDia)
    const hasta = aYMD(ultimoDia)

    const { data } = await supabase
      .from('vista_dias_mes')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha')

    const todosDias = []
    for (let d = new Date(primerDia); d <= ultimoDia; d.setDate(d.getDate() + 1)) {
      const fechaStr = aYMD(d)
      const planificado = data?.find(p => p.fecha === fechaStr)
      todosDias.push({
        fecha: fechaStr,
        dia: new Date(fechaStr + 'T12:00:00').getDate(),
        dimensionadores: planificado?.dimensionadores ?? null,
        cuota: planificado?.cuota ?? null,
        agendadas: planificado?.agendadas ?? 0,
        cupo_disponible: planificado?.cupo_disponible ?? null,
        id: planificado?.id ?? null
      })
    }
    setDias(todosDias)
    setLoading(false)
  }

  async function fetchOrdenes() {
    const primerDia = aYMD(new Date(mes.year, mes.month, 1))
    const ultimoDia = aYMD(new Date(mes.year, mes.month + 1, 0))

    const { data, error } = await supabase
      .from('ordenes')
      .select(`
        id,
        cantidad,
        fecha_agendada,
        aprobado_en,
        telefono_cliente,
        nota,
        estado,
        nro_boleta,
        vendedor:profiles!vendedor_id(nombre),
        tipo:tipos_plancha!tipo_plancha_id(nombre, medida, categoria)
      `)
      .in('estado', ['pendiente', 'aprobada'])
      .or(`fecha_agendada.gte.${primerDia},aprobado_en.gte.${primerDia}T00:00:00`)
      .lte('fecha_agendada', ultimoDia)
      .order('creado_en', { ascending: true })

    if (error) {
      console.error('Error fetchOrdenes tablero:', error)
      return
    }

    const agrupadas = (data ?? []).reduce((acc, o) => {
      const key = o.fecha_agendada
      if (!key) return acc
      if (!acc[key]) acc[key] = []
      acc[key].push(o)
      return acc
    }, {})
    setOrdenesPorFecha(agrupadas)
  }

  async function handleGuardarDim(fecha, dimensionadores) {
    setGuardando(true)
    const { data: existente } = await supabase
      .from('planificacion_dias')
      .select('id')
      .eq('fecha', fecha)
      .maybeSingle()

    if (existente) {
      await supabase.from('planificacion_dias').update({ dimensionadores }).eq('fecha', fecha)
    } else {
      await supabase.from('planificacion_dias').insert({ fecha, dimensionadores, creado_por: profile.id })
    }

    setEditando(null)
    setGuardando(false)
    fetchDias()
  }

  const nombreMes = new Date(mes.year, mes.month).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })

  const colorCupo = (d) => {
    if (!d.cuota) return { bg: 'var(--bg3)', border: 'var(--border)', text: 'var(--text3)' }
    if (d.agendadas === 0) return { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', text: 'var(--green)' }
    if (d.cupo_disponible > 0) return { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', text: 'var(--blue)' }
    if (d.cupo_disponible === 0) return { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', text: 'var(--amber)' }
    return { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', text: 'var(--red)' }
  }

  const esPasado = (fecha) => fecha < hoy
  const esHoyFn = (fecha) => fecha === hoy

  return (
    <div style={{ color: 'var(--text1)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px', textTransform: 'capitalize' }}>
            Tablero — {nombreMes}
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Planificación de dimensionadores y órdenes agendadas</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setMes(m => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() } })}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}>
            ← Anterior
          </button>
          <button onClick={() => { const hoyD = new Date(); setMes({ year: hoyD.getFullYear(), month: hoyD.getMonth() }) }}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--blue)', borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}>
            Hoy
          </button>
          <button onClick={() => setMes(m => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() } })}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '7px 14px', fontSize: '13px' }}>
            Siguiente →
          </button>
        </div>
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { color: 'var(--green)', label: 'Sin órdenes' },
          { color: 'var(--blue)', label: 'Con cupo' },
          { color: 'var(--amber)', label: 'Cuota llena' },
          { color: 'var(--red)', label: 'Excedido' },
          { color: 'var(--text3)', label: 'Sin planificar' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: l.color }} />
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{l.label}</span>
          </div>
        ))}
        {/* Leyenda órdenes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--amber)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Orden pendiente</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--green)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Orden aprobada</span>
        </div>
      </div>

      {/* Días semana header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '6px' }}>
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', padding: '4px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grilla */}
      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando tablero...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
          {Array.from({ length: (new Date(mes.year, mes.month, 1).getDay() + 6) % 7 }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {dias.map(d => {
            const colores = colorCupo(d)
            const pasado = esPasado(d.fecha)
            const esHoyDia = esHoyFn(d.fecha)
            const ordenesDelDia = ordenesPorFecha[d.fecha] ?? []
            const pendientes = ordenesDelDia.filter(o => o.estado === 'pendiente')
            const aprobadas = ordenesDelDia.filter(o => o.estado === 'aprobada')
            const tieneOrdenes = ordenesDelDia.length > 0
            const estaExpandido = expandido === d.fecha

            return (
              <div key={d.fecha} style={{
                background: esHoyDia ? 'rgba(59,130,246,0.12)' : pasado ? 'rgba(255,255,255,0.02)' : colores.bg,
                border: `1px solid ${esHoyDia ? 'var(--blue)' : tieneOrdenes ? 'rgba(59,130,246,0.3)' : colores.border}`,
                borderRadius: '10px',
                padding: '8px',
                minHeight: '90px',
                opacity: pasado && !esHoyDia ? 0.6 : 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                {/* Número día */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontSize: '14px', fontWeight: '500',
                    color: esHoyDia ? 'var(--blue)' : pasado ? 'var(--text3)' : 'var(--text1)',
                    background: esHoyDia ? 'var(--blue-soft)' : 'transparent',
                    borderRadius: '6px', padding: esHoyDia ? '1px 6px' : '0'
                  }}>
                    {d.dia}
                  </span>
                  {d.dimensionadores && (
                    <span style={{ fontSize: '10px', color: 'var(--text3)' }}>👤×{d.dimensionadores}</span>
                  )}
                </div>

                {/* Cuota */}
                {d.cuota ? (
                  <>
                    <div style={{ fontSize: '11px', color: colores.text, fontWeight: '500' }}>
                      {d.agendadas}/{d.cuota}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '99px', height: '3px' }}>
                      <div style={{
                        height: '3px', borderRadius: '99px', background: colores.text,
                        width: `${Math.min(100, (d.agendadas / d.cuota) * 100)}%`
                      }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                      {d.cupo_disponible > 0 ? `${d.cupo_disponible} libre` : d.cupo_disponible === 0 ? 'Lleno' : `+${Math.abs(d.cupo_disponible)} exceso`}
                    </div>
                  </>
                ) : (
                  !pasado && <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Sin planificar</span>
                )}

                {/* Órdenes del día */}
                {tieneOrdenes && (
                  <div style={{ marginTop: '2px' }}>
                    <button onClick={() => setExpandido(estaExpandido ? null : d.fecha)}
                      style={{
                        background: 'rgba(59,130,246,0.12)', border: 'none', borderRadius: '6px',
                        padding: '3px 6px', fontSize: '10px', color: 'var(--blue)',
                        cursor: 'pointer', width: '100%', textAlign: 'left', fontWeight: '500'
                      }}>
                      {pendientes.length > 0 && `🕐 ${pendientes.length} pend.`}
                      {pendientes.length > 0 && aprobadas.length > 0 && ' · '}
                      {aprobadas.length > 0 && `✓ ${aprobadas.length} apr.`}
                      {' '}{estaExpandido ? '▲' : '▼'}
                    </button>

                    {estaExpandido && (
                      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {/* Pendientes */}
                        {pendientes.map(o => (
                          <div key={o.id} style={{
                            background: 'rgba(245,158,11,0.1)',
                            border: '1px solid rgba(245,158,11,0.25)',
                            borderRadius: '6px', padding: '6px 8px',
                            fontSize: '11px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                              <span style={{ background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: '9px', fontWeight: '500', padding: '1px 5px', borderRadius: '99px' }}>Pendiente</span>
                            </div>
                            <div style={{ fontWeight: '500', color: 'var(--text1)', marginBottom: '2px' }}>
                              {o.tipo?.nombre} {o.tipo?.medida}
                            </div>
                            <div style={{ color: 'var(--amber)' }}>{o.cantidad} planchas</div>
                            {puedeVerContacto && o.telefono_cliente && <div style={{ color: 'var(--text3)', marginTop: '2px' }}>📞 {o.telefono_cliente}</div>}
                            {o.nota && <div style={{ color: 'var(--text3)' }}>📝 {o.nota}</div>}
                            <div style={{ color: 'var(--text3)', marginTop: '2px' }}>👤 {o.vendedor?.nombre}</div>
                          </div>
                        ))}

                        {/* Aprobadas */}
                        {aprobadas.map(o => (
                          <div key={o.id} style={{
                            background: 'rgba(16,185,129,0.08)',
                            border: '1px solid rgba(16,185,129,0.25)',
                            borderRadius: '6px', padding: '6px 8px',
                            fontSize: '11px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                              <span style={{ background: 'var(--green-soft)', color: 'var(--green)', fontSize: '9px', fontWeight: '500', padding: '1px 5px', borderRadius: '99px' }}>✓ Aprobada</span>
                              {o.nro_boleta && <span style={{ fontSize: '9px', color: 'var(--text3)' }}>#{o.nro_boleta}</span>}
                            </div>
                            <div style={{ fontWeight: '500', color: 'var(--text1)', marginBottom: '2px' }}>
                              {o.tipo?.nombre} {o.tipo?.medida}
                            </div>
                            <div style={{ color: 'var(--green)' }}>{o.cantidad} planchas</div>
                            {puedeVerContacto && o.telefono_cliente && <div style={{ color: 'var(--text3)', marginTop: '2px' }}>📞 {o.telefono_cliente}</div>}
                            {o.nota && <div style={{ color: 'var(--text3)' }}>📝 {o.nota}</div>}
                            <div style={{ color: 'var(--text3)', marginTop: '2px' }}>👤 {o.vendedor?.nombre}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Botón asignar dimensionadores */}
                {esAdmin && !pasado && (
                  editando === d.fecha ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[1, 2, 3].map(n => (
                          <button key={n} onClick={() => handleGuardarDim(d.fecha, n)} disabled={guardando}
                            style={{
                              flex: 1,
                              background: d.dimensionadores === n ? 'var(--blue)' : 'var(--bg3)',
                              color: d.dimensionadores === n ? '#fff' : 'var(--text2)',
                              border: '1px solid var(--border)', borderRadius: '6px',
                              padding: '3px', fontSize: '12px', fontWeight: '500'
                            }}>
                            {n}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setEditando(null)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '10px' }}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditando(d.fecha)}
                      style={{
                        background: 'transparent', border: '1px dashed var(--border)',
                        color: 'var(--text3)', borderRadius: '6px', padding: '3px',
                        fontSize: '10px', marginTop: 'auto', cursor: 'pointer'
                      }}>
                      {d.dimensionadores ? 'Editar' : '+ Asignar'}
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}