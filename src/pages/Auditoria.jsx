import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { PERIODOS, diaDe, horaDe, limites, etiquetaDia } from '../lib/periodos'
import { Avatar } from '../components/CuentasRapidas'
import NumeroAnimado from '../components/NumeroAnimado'

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
  INSERT: { texto: 'Creó', color: 'var(--green)', soft: 'var(--green-soft)', icono: '➕' },
  UPDATE: { texto: 'Modificó', color: 'var(--info)', soft: 'var(--info-soft)', icono: '✏️' },
  DELETE: { texto: 'Eliminó', color: 'var(--red)', soft: 'var(--red-soft)', icono: '🗑️' },
}
// Campos técnicos que no aportan al leer un cambio
const IGNORAR = new Set(['actualizado_en', 'creado_en', 'actualizado_por'])
const LIMITE = 500

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
  const cuentaOp = (op) => filas.filter(f => (tabla === '' || f.tabla === tabla) && (usuario === '' || (f.usuario_nombre ?? 'Sistema / SQL') === usuario) && (op === '' || f.operacion === op)).length

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '2px' }}>Auditoría de base de datos</h2>
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
          Registro automático: cada creación, cambio o eliminación queda guardado con quién lo hizo, y no se puede editar ni borrar.
        </p>
      </div>

      <div className="chip-fila" style={{ marginBottom: '12px' }}>
        {PERIODOS.map(p => <button key={p.key} className={`chip-x${periodo === p.key ? ' activo' : ''}`} onClick={() => setPeriodo(p.key)}>{p.label}</button>)}
      </div>
      {periodo === 'rango' && (
        <div className="entrada" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text3)' }}>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ width: 'auto' }} />
          <label style={{ fontSize: '12px', color: 'var(--text3)' }}>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ width: 'auto' }} />
        </div>
      )}

      {/* Resumen: tocar una tarjeta filtra por ese tipo de cambio */}
      <div className="stat-grid" style={{ marginTop: '14px' }}>
        {[
          { clave: '', icono: '🛡️', titulo: 'Registros', color: 'var(--primary)', soft: 'var(--primary-soft)', detalle: 'cambios en el período' },
          { clave: 'INSERT', icono: '➕', titulo: 'Creaciones', color: 'var(--green)', soft: 'var(--green-soft)', detalle: 'datos nuevos' },
          { clave: 'UPDATE', icono: '✏️', titulo: 'Modificaciones', color: 'var(--info)', soft: 'var(--info-soft)', detalle: 'datos cambiados' },
          { clave: 'DELETE', icono: '🗑️', titulo: 'Eliminaciones', color: 'var(--red)', soft: 'var(--red-soft)', detalle: 'datos borrados' },
        ].map(t => (
          <button key={t.titulo} className={`stat-card${operacion === t.clave ? ' activo' : ''}`} style={{ '--c': t.color, '--cs': t.soft, cursor: 'pointer' }}
            onClick={() => setOperacion(operacion === t.clave ? '' : t.clave)}>
            <div className="stat-icono">{t.icono}</div>
            <div>
              <p className="stat-valor"><NumeroAnimado valor={cuentaOp(t.clave)} /></p>
              <p className="stat-titulo">{t.titulo}</p>
              <p className="stat-detalle">{t.detalle}</p>
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 20px' }}>
        <select value={tabla} onChange={e => setTabla(e.target.value)} style={{ width: 'auto', minWidth: '170px' }}>
          <option value="">Todas las secciones</option>
          {Object.entries(TABLAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={usuario} onChange={e => setUsuario(e.target.value)} style={{ width: 'auto', minWidth: '170px' }}>
          <option value="">Todos los usuarios</option>
          {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        {hayFiltro && (
          <button onClick={() => { setTabla(''); setOperacion(''); setUsuario('') }}
            style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '13px', fontWeight: 600 }}>✕ Limpiar filtros</button>
        )}
      </div>

      {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px' }}>{error}</p>}

      {periodo === 'rango' && !rango ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '30px', textAlign: 'center' }}><p style={{ color: 'var(--text3)', fontSize: '13px' }}>Elige las fechas “Desde” y “Hasta”.</p></div>
      ) : loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando auditoría...</p>
      ) : lista.length === 0 ? (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
          <p className="rebote" style={{ fontSize: '38px', marginBottom: '8px' }}>🛡️</p>
          <p style={{ color: 'var(--text2)', fontWeight: 600 }}>{hayFiltro ? 'No hay registros que coincidan con los filtros' : 'No hay registros en este período'}</p>
        </div>
      ) : (
        <>
          {filas.length >= LIMITE && (
            <p style={{ fontSize: '12px', color: 'var(--amber)', marginBottom: '10px' }}>Se muestran los {LIMITE} registros más recientes del período. Acota las fechas para ver el resto.</p>
          )}
          <div>
            {Object.entries(porDia).map(([dia, items]) => (
              <div key={dia}>
                <div className="act-dia">
                  <span className="act-dia-pildora">📅 <span className="t">{etiquetaDia(dia)}</span> <span className="n">{items.length} registro{items.length === 1 ? '' : 's'}</span></span>
                  <span className="act-dia-linea" />
                </div>
                <div className="act-lista">
                  {items.map((f, i) => {
                    const op = OPERACIONES[f.operacion] ?? OPERACIONES.UPDATE
                    const dif = f.operacion === 'UPDATE' ? cambios(f) : []
                    const expandido = abierto === f.id
                    const quien = f.usuario_nombre ?? 'Sistema / SQL'
                    return (
                      <div key={f.id} className="act-item" style={{ '--c': op.color, '--cs': op.soft, '--i': i }}>
                        <div className="act-nodo" aria-hidden="true">{op.icono}</div>
                        <div className="act-tarjeta" style={{ padding: 0 }}>
                          <button onClick={() => setAbierto(expandido ? null : f.id)} aria-expanded={expandido}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'transparent', border: 'none', textAlign: 'left', flexWrap: 'wrap', color: 'var(--text1)' }}>
                            <Avatar nombre={quien} tamano={30} />
                            <span style={{ flex: 1, minWidth: '170px' }}>
                              <span style={{ display: 'block', fontSize: '14px' }}>
                                <strong>{quien}</strong> <span style={{ color: op.color, fontWeight: 600 }}>{op.texto.toLowerCase()}</span> en <strong>{TABLAS[f.tabla] ?? f.tabla}</strong>
                              </span>
                              {f.operacion === 'UPDATE' && dif.length > 0 && (
                                <span style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px' }}>
                                  {dif.slice(0, 4).map(d => <span key={d.campo} className="etiqueta neutra">{d.campo}</span>)}
                                  {dif.length > 4 && <span className="etiqueta neutra">+{dif.length - 4}</span>}
                                </span>
                              )}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>{horaDe(f.creado_en)}</span>
                            <span className={`chevron${expandido ? ' abierto' : ''}`} style={{ fontSize: '12px', color: 'var(--text3)' }}>▼</span>
                          </button>
                          <div className={`acordeon${expandido ? ' abierto' : ''}`}>
                            <div>
                              {expandido && (
                                <div style={{ padding: '4px 16px 16px', background: 'var(--bg3)', borderRadius: '0 0 13px 13px' }}>
                                  <p style={{ fontSize: '11px', color: 'var(--text3)', margin: '10px 0 8px' }}>Registro: {f.registro_id ?? '—'}</p>
                                  {f.operacion === 'UPDATE' ? (
                                    dif.length === 0 ? <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Sin cambios visibles (solo campos técnicos).</p> : (
                                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '6px 14px', fontSize: '12px' }}>
                                        <span style={{ color: 'var(--text3)', fontWeight: 600 }}>Campo</span>
                                        <span style={{ color: 'var(--text3)', fontWeight: 600 }}>Antes</span>
                                        <span style={{ color: 'var(--text3)', fontWeight: 600 }}>Después</span>
                                        {dif.map(d => (
                                          <div key={d.campo} style={{ display: 'contents' }}>
                                            <span style={{ fontWeight: 600 }}>{d.campo}</span>
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
                          </div>
                        </div>
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
