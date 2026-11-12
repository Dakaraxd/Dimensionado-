import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { PERIODOS, diaDe, horaDe, limites, etiquetaDia } from '../lib/periodos'
import { TIPOS_MOVIMIENTO } from '../lib/movimientos'

const TIPOS_FILTRO = [
  { key: 'todos', label: 'Todos' },
  { key: 'ingreso', label: '📥 Ingresos' },
  { key: 'merma', label: '🗑️ Mermas' },
  { key: 'devolucion', label: '↩️ Devoluciones' },
  { key: 'ajuste', label: '⚖️ Ajustes' },
  { key: 'venta', label: '🛒 Ventas' },
]

const ESTILO_VENTA = { icono: '🛒', nombre: 'Venta', color: 'var(--text2)', soft: 'var(--bg3)' }
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px' }
const chip = (activo) => ({
  padding: '6px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
  border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
  background: activo ? 'var(--primary)' : 'var(--bg2)',
  color: activo ? '#fff' : 'var(--text2)'
})

function Tarjeta({ icono, titulo, valor, color = 'var(--text1)' }) {
  return (
    <div style={{ ...card, padding: '14px 18px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 600, marginBottom: '6px' }}>{icono} {titulo}</p>
      <p style={{ fontSize: '26px', fontWeight: 700, color, lineHeight: 1.15 }}>{valor}</p>
    </div>
  )
}

// Historial de movimientos del inventario. Las ventas aprobadas se muestran como salidas
// para tener el flujo completo (entradas y salidas) en un solo lugar.
export default function MovimientosInventario({ recarga = 0 }) {
  const [periodo, setPeriodo] = useState('mes')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [plancha, setPlancha] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const rango = limites(periodo, desde, hasta)

  async function cargar() {
    if (!rango) { setFilas([]); setLoading(false); return }
    setLoading(true)
    setError('')
    const ini = rango.desde.toISOString()
    const fin = rango.hasta.toISOString()
    const [mov, ventas] = await Promise.all([
      supabase.from('movimientos_inventario')
        .select('*, plancha:tipos_plancha!tipo_plancha_id(nombre, medida)')
        .gte('creado_en', ini).lt('creado_en', fin).order('creado_en', { ascending: false }),
      supabase.from('ordenes')
        .select('id, cantidad, nro_boleta, aprobado_en, cliente_nombre, tipo_plancha_id, tipo:tipos_plancha!tipo_plancha_id(nombre, medida), vendedor:profiles!vendedor_id(nombre)')
        .eq('estado', 'aprobada').gte('aprobado_en', ini).lt('aprobado_en', fin).order('aprobado_en', { ascending: false }),
    ])
    if (mov.error) setError('No se pudieron cargar los movimientos de inventario')

    const deMov = (mov.data ?? []).map(m => ({
      id: m.id, fecha: m.creado_en, tipo: m.tipo, planchaId: m.tipo_plancha_id,
      plancha: `${m.plancha?.nombre ?? ''} ${m.plancha?.medida ?? ''}`.trim(),
      efecto: m.tipo === 'merma' ? -m.cantidad : m.cantidad,
      antes: m.stock_antes, despues: m.stock_despues,
      detalle: [m.motivo, m.referencia && `Ref: ${m.referencia}`].filter(Boolean).join(' · '),
      usuario: m.usuario_nombre,
    }))
    const deVentas = (ventas.data ?? []).map(o => ({
      id: 'v' + o.id, fecha: o.aprobado_en, tipo: 'venta', planchaId: o.tipo_plancha_id,
      plancha: `${o.tipo?.nombre ?? ''} ${o.tipo?.medida ?? ''}`.trim(),
      efecto: -o.cantidad, antes: null, despues: null,
      detalle: [`Boleta #${o.nro_boleta}`, o.cliente_nombre].filter(Boolean).join(' · '),
      usuario: o.vendedor?.nombre,
    }))
    setFilas([...deMov, ...deVentas].sort((a, b) => b.fecha.localeCompare(a.fecha)))
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [periodo, desde, hasta, recarga])

  const resumen = useMemo(() => {
    const suma = (t) => filas.filter(f => f.tipo === t).reduce((s, f) => s + Math.abs(f.efecto), 0)
    const ingresos = suma('ingreso')
    const mermas = suma('merma')
    return {
      ingresos, mermas, devoluciones: suma('devolucion'), ventas: suma('venta'),
      ajustes: filas.filter(f => f.tipo === 'ajuste').reduce((s, f) => s + f.efecto, 0),
      neto: filas.reduce((s, f) => s + f.efecto, 0),
      pctMerma: ingresos > 0 ? Math.round((mermas / ingresos) * 100) : null,
    }
  }, [filas])

  const planchas = useMemo(() => {
    const m = new Map()
    filas.forEach(f => { if (f.planchaId && f.plancha) m.set(f.planchaId, f.plancha) })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [filas])

  const q = busqueda.trim().toLowerCase()
  const lista = filas.filter(f =>
    (tipo === 'todos' || f.tipo === tipo) &&
    (plancha === '' || f.planchaId === plancha) &&
    (q === '' || f.plancha.toLowerCase().includes(q) || f.detalle.toLowerCase().includes(q) || (f.usuario ?? '').toLowerCase().includes(q))
  )
  const porDia = lista.reduce((acc, f) => { const k = diaDe(f.fecha); (acc[k] ??= []).push(f); return acc }, {})
  const hayFiltro = tipo !== 'todos' || plancha !== '' || q !== ''
  const signo = (n) => (n > 0 ? '+' : '') + n

  return (
    <div>
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
          <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Elige las fechas “Desde” y “Hasta”.</p>
        </div>
      ) : loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando movimientos...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <Tarjeta icono="📥" titulo="Ingresos" valor={resumen.ingresos} color="var(--green)" />
            <Tarjeta icono="🗑️" titulo="Mermas" valor={resumen.mermas} color={resumen.mermas > 0 ? 'var(--red)' : 'var(--text1)'} />
            <Tarjeta icono="↩️" titulo="Devoluciones" valor={resumen.devoluciones} />
            <Tarjeta icono="⚖️" titulo="Ajustes (neto)" valor={signo(resumen.ajustes)} />
            <Tarjeta icono="🛒" titulo="Salidas por venta" valor={resumen.ventas} />
            <Tarjeta icono="📊" titulo="Variación neta" valor={signo(resumen.neto)} color={resumen.neto < 0 ? 'var(--red)' : 'var(--green)'} />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <input type="text" placeholder="🔍 Buscar por plancha, motivo, referencia o usuario..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '18px' }}>
            {TIPOS_FILTRO.map(t => <button key={t.key} style={chip(tipo === t.key)} onClick={() => setTipo(t.key)}>{t.label}</button>)}
            {planchas.length > 1 && (
              <select value={plancha} onChange={e => setPlancha(e.target.value)} style={{ width: 'auto', minWidth: '180px' }}>
                <option value="">Todas las planchas</option>
                {planchas.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
              </select>
            )}
            {hayFiltro && (
              <button onClick={() => { setTipo('todos'); setPlancha(''); setBusqueda('') }}
                style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: 500 }}>✕ Limpiar filtros</button>
            )}
          </div>

          {lista.length === 0 ? (
            <div style={{ ...card, padding: '40px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text3)' }}>{hayFiltro ? 'No hay movimientos que coincidan con los filtros.' : 'No hay movimientos en este período.'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {Object.entries(porDia).map(([dia, items]) => (
                <div key={dia}>
                  <p style={{ fontSize: '14px', fontWeight: 600, textTransform: 'capitalize', marginBottom: '8px' }}>{etiquetaDia(dia)}</p>
                  <div style={{ ...card, overflow: 'hidden' }}>
                    {items.map((f, i) => {
                      const est = TIPOS_MOVIMIENTO[f.tipo] ?? ESTILO_VENTA
                      return (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text3)', minWidth: '66px', whiteSpace: 'nowrap' }}>{horaDe(f.fecha)}</span>
                          <span style={{ background: est.soft, color: est.color, fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px', minWidth: '98px', textAlign: 'center' }}>
                            {est.icono} {est.nombre}
                          </span>
                          <span style={{ flex: 1, minWidth: '170px' }}>
                            <span style={{ display: 'block', fontSize: '14px', fontWeight: 500 }}>{f.plancha}</span>
                            <span style={{ display: 'block', fontSize: '12px', color: 'var(--text3)' }}>
                              {[f.detalle, f.usuario && `por ${f.usuario}`].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </span>
                          <span style={{ fontSize: '16px', fontWeight: 700, color: f.efecto < 0 ? 'var(--red)' : 'var(--green)', minWidth: '48px', textAlign: 'right' }}>{signo(f.efecto)}</span>
                          {f.antes !== null && f.despues !== null && (
                            <span style={{ fontSize: '11px', color: 'var(--text3)', minWidth: '72px', textAlign: 'right' }}>disp. {f.antes} → {f.despues}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
