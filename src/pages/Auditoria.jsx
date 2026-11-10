import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { PERIODOS, diaDe, horaDe, limites, etiquetaDia } from '../lib/periodos'

const TABLAS = {
  ordenes: 'Órdenes',
  orden_servicios: 'Servicios de orden',
  proyectos_dimensionado: 'Dimensionado',
  stock_general: 'Stock',
  tipos_plancha: 'Planchas',
  profiles: 'Usuarios',
  planificacion_dias: 'Planificador',
}
const OPERACIONES = {
  INSERT: { texto: 'Creó', color: 'var(--green)', soft: 'var(--green-soft)' },
  UPDATE: { texto: 'Modificó', color: 'var(--info)', soft: 'var(--info-soft)' },
  DELETE: { texto: 'Eliminó', color: 'var(--red)', soft: 'var(--red-soft)' },
}
// Campos técnicos que no aportan al leer un cambio
const IGNORAR = new Set(['actualizado_en', 'creado_en', 'actualizado_por'])
const LIMITE = 500

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px' }
const chip = (activo) => ({
  padding: '6px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
  border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
  background: activo ? 'var(--primary)' : 'var(--bg2)',
  color: activo ? '#fff' : 'var(--text2)'
})

const fmt = (v) => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

// Campos que cambiaron entre antes y después
function cambios(a) {
  const antes = a.datos_antes ?? {}
  const despues = a.datos_despues ?? {}
  const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])]
  return claves
    .filter(k => !IGNORAR.has(k) && JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
    .map(k => ({ campo: k, antes: antes[k], despues: despues[k] }))
}

export default function Auditoria() {
  const [periodo, setPeriodo] = useState('semana')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [filas, setFilas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tabla, setTabla] = useState('')
  const [operacion, setOperacion] = useState('')
  const [usuario, setUsuario] = useState('')
  const [abierto, setAbierto] = useState(null)

  const rango = limites(periodo, desde, hasta)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      if (!rango) { setFilas([]); setLoading(false); return }
      setLoading(true)
      setError('')
      const { data, error: err } = await supabase.from('auditoria').select('*')
        .gte('creado_en', rango.desde.toISOString()).lt('creado_en', rango.hasta.toISOString())
        .order('creado_en', { ascending: false }).limit(LIMITE)
      if (cancelado) return
      if (err) setError('No se pudo cargar la auditoría. ¿Ya se ejecutó el SQL de auditoría?')
      setFilas(data ?? [])
      setLoading(false)
    }
    cargar()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, desde, hasta])

  const usuarios = useMemo(() => [...new Set(filas.map(f => f.usuario_nombre ?? 'Sistema / SQL'))].sort(), [filas])
  const lista = filas.filter(f =>
    (tabla === '' || f.tabla === tabla) &&
    (operacion === '' || f.operacion === operacion) &&
    (usuario === '' || (f.usuario_nombre ?? 'Sistema / SQL') === usuario))
  const porDia = lista.reduce((acc, f) => { const k = diaDe(f.creado_en); (acc[k] ??= []).push(f); return acc }, {})
  const hayFiltro = tabla !== '' || operacion !== '' || usuario !== ''

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '14px' }}>
        Registro automático de la base de datos: cada creación, cambio o eliminación queda guardado con quién lo hizo, y no se puede editar ni borrar.
      </p>
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

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '14px 0 18px' }}>
        <select value={tabla} onChange={e => setTabla(e.target.value)} style={{ width: 'auto', minWidth: '170px' }}>
          <option value="">Todas las secciones</option>
          {Object.entries(TABLAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={operacion} onChange={e => setOperacion(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
          <option value="">Toda acción</option>
          {Object.entries(OPERACIONES).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
        <select value={usuario} onChange={e => setUsuario(e.target.value)} style={{ width: 'auto', minWidth: '170px' }}>
          <option value="">Todos los usuarios</option>
          {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        {hayFiltro && (
          <button onClick={() => { setTabla(''); setOperacion(''); setUsuario('') }}
            style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: 500 }}>✕ Limpiar filtros</button>
        )}
      </div>

      {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px' }}>{error}</p>}

      {periodo === 'rango' && !rango ? (
        <div style={{ ...card, padding: '30px', textAlign: 'center' }}><p style={{ color: 'var(--text3)', fontSize: '13px' }}>Elige las fechas “Desde” y “Hasta”.</p></div>
      ) : loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando auditoría...</p>
      ) : lista.length === 0 ? (
        <div style={{ ...card, padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text3)' }}>{hayFiltro ? 'No hay registros que coincidan con los filtros.' : 'No hay registros en este período.'}</p>
        </div>
      ) : (
        <>
          {filas.length >= LIMITE && (
            <p style={{ fontSize: '12px', color: 'var(--amber)', marginBottom: '10px' }}>Se muestran los {LIMITE} registros más recientes del período. Acota las fechas para ver el resto.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {Object.entries(porDia).map(([dia, items]) => (
              <div key={dia}>
                <p style={{ fontSize: '14px', fontWeight: 600, textTransform: 'capitalize', marginBottom: '8px' }}>{etiquetaDia(dia)}</p>
                <div style={{ ...card, overflow: 'hidden' }}>
                  {items.map((f, i) => {
                    const op = OPERACIONES[f.operacion] ?? OPERACIONES.UPDATE
                    const dif = f.operacion === 'UPDATE' ? cambios(f) : []
                    const expandido = abierto === f.id
                    return (
                      <div key={f.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                        <button onClick={() => setAbierto(expandido ? null : f.id)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 16px', background: 'transparent', border: 'none', textAlign: 'left', flexWrap: 'wrap', color: 'var(--text1)' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text3)', minWidth: '50px' }}>{horaDe(f.creado_en)}</span>
                          <span style={{ background: op.soft, color: op.color, fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px', minWidth: '78px', textAlign: 'center' }}>{op.texto}</span>
                          <span style={{ flex: 1, minWidth: '170px' }}>
                            <span style={{ display: 'block', fontSize: '14px', fontWeight: 500 }}>{TABLAS[f.tabla] ?? f.tabla}</span>
                            <span style={{ display: 'block', fontSize: '12px', color: 'var(--text3)' }}>
                              {f.usuario_nombre ?? 'Sistema / SQL'}
                              {f.operacion === 'UPDATE' && dif.length > 0 && ` · ${dif.map(d => d.campo).slice(0, 4).join(', ')}${dif.length > 4 ? '…' : ''}`}
                            </span>
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{expandido ? '▲' : '▼'}</span>
                        </button>
                        {expandido && (
                          <div style={{ padding: '4px 16px 16px', background: 'var(--bg3)' }}>
                            <p style={{ fontSize: '11px', color: 'var(--text3)', margin: '10px 0 8px' }}>Registro: {f.registro_id ?? '—'}</p>
                            {f.operacion === 'UPDATE' ? (
                              dif.length === 0 ? <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Sin cambios visibles (solo campos técnicos).</p> : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '6px 14px', fontSize: '12px' }}>
                                  <span style={{ color: 'var(--text3)', fontWeight: 600 }}>Campo</span>
                                  <span style={{ color: 'var(--text3)', fontWeight: 600 }}>Antes</span>
                                  <span style={{ color: 'var(--text3)', fontWeight: 600 }}>Después</span>
                                  {dif.map(d => (
                                    <div key={d.campo} style={{ display: 'contents' }}>
                                      <span style={{ fontWeight: 500 }}>{d.campo}</span>
                                      <span style={{ color: 'var(--red)', wordBreak: 'break-word' }}>{fmt(d.antes)}</span>
                                      <span style={{ color: 'var(--green)', wordBreak: 'break-word' }}>{fmt(d.despues)}</span>
                                    </div>
                                  ))}
                                </div>
                              )
                            ) : (
                              <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text2)', margin: 0, maxHeight: '260px', overflow: 'auto' }}>
                                {JSON.stringify(f.operacion === 'DELETE' ? f.datos_antes : f.datos_despues, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
