import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal } from './CuentasRapidas'
import { calcularMeta, fechaChile, HITOS, PORCENTAJE_META } from '../lib/meta'
import NumeroAnimado from './NumeroAnimado'

const nf = (n) => Number(n ?? 0).toLocaleString('es-CL')
const MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 20px', marginBottom: '18px', position: 'relative', overflow: 'hidden' }
const label = { display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }

function Dato({ icono, titulo, valor, detalle }) {
  return (
    <div style={{ flex: '1 1 140px', background: 'var(--bg3)', borderRadius: '10px', padding: '10px 12px' }}>
      <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '2px' }}>{icono} {titulo}</p>
      <p style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text1)', lineHeight: 1.2 }}>{valor}</p>
      {detalle && <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{detalle}</p>}
    </div>
  )
}

// El subgerente ingresa las planchas vendidas el año anterior; la meta es esa cifra + el porcentaje
function ConfigurarMeta({ anio, fila, vendidasSistema, onCerrar, onGuardado }) {
  const [ventas, setVentas] = useState(fila ? String(fila.ventas_anio_anterior) : '')
  const [porcentaje, setPorcentaje] = useState(String(fila?.porcentaje ?? PORCENTAJE_META))
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const base = /^\d+$/.test(ventas) ? parseInt(ventas, 10) : null
  const pct = /^\d+(\.\d{1,2})?$/.test(porcentaje) ? parseFloat(porcentaje) : null
  const metaPrevia = base && pct !== null ? Math.ceil(base * (1 + pct / 100)) : null

  async function guardar(e) {
    e.preventDefault()
    if (!base || base < 1) { setError(`Ingresa las planchas vendidas en ${anio - 1} (un número mayor que 0)`); return }
    if (pct === null || pct > 200) { setError('El aumento debe ser un número entre 0 y 200'); return }
    setGuardando(true)
    setError('')
    const { error: err } = await supabase.from('metas_anuales')
      .upsert({ anio, ventas_anio_anterior: base, porcentaje: pct }, { onConflict: 'anio' })
    setGuardando(false)
    if (err) { setError('No se pudo guardar. Solo un subgerente puede cambiar la meta.'); return }
    onGuardado?.()
    onCerrar()
  }

  return (
    <Modal titulo="Configurar la meta del año" onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '6px' }}>🎯 Meta de ventas {anio}</h3>
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px', lineHeight: 1.5 }}>
          Ingresa cuántas planchas se vendieron en <strong>{anio - 1}</strong>. La meta de {anio} será esa cifra más el aumento.
          El año siguiente se calculará solo con las ventas reales que registre el sistema, salvo que ingreses otra cifra.
        </p>

        <label style={label}>Planchas vendidas en {anio - 1} *</label>
        <input type="text" inputMode="numeric" autoFocus value={ventas} placeholder="Ej: 8200"
          onChange={e => { setVentas(e.target.value.replace(/\D/g, '')); setError('') }} style={{ marginBottom: '6px' }} />
        {vendidasSistema > 0 && (
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
            El sistema tiene {nf(vendidasSistema)} planchas registradas en {anio - 1}.{' '}
            <button type="button" onClick={() => setVentas(String(vendidasSistema))}
              style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '12px', fontWeight: 600, padding: 0 }}>Usar esa cifra</button>
          </p>
        )}

        <label style={{ ...label, marginTop: vendidasSistema > 0 ? 0 : '12px' }}>Aumento de la meta (%)</label>
        <input type="text" inputMode="decimal" value={porcentaje}
          onChange={e => { setPorcentaje(e.target.value.replace(/[^\d.]/g, '')); setError('') }} />

        {metaPrevia !== null && (
          <div style={{ background: 'var(--primary-soft)', borderRadius: '10px', padding: '10px 14px', marginTop: '14px', fontSize: '13px' }}>
            Meta {anio}: <strong style={{ color: 'var(--primary)' }}>{nf(metaPrevia)} planchas</strong>
          </div>
        )}
        {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
            style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 18px', fontSize: '14px' }}>Cancelar</button>
          <button type="submit" disabled={guardando}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 22px', fontSize: '14px', fontWeight: 600, opacity: guardando ? 0.7 : 1 }}>
            {guardando ? 'Guardando...' : 'Guardar meta'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Confeti de celebración al cumplir la meta (se apaga si la persona pidió menos animaciones)
function Confeti() {
  const piezas = ['🎉', '✨', '🎊', '⭐', '🥳']
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: 22 }, (_, i) => (
        <span key={i} className="confeti" style={{ left: `${(i * 4.7 + 3) % 98}%`, animationDelay: `${(i % 7) * 0.18}s` }}>{piezas[i % piezas.length]}</span>
      ))}
    </div>
  )
}

export default function MetaAnual() {
  const { profile } = useAuth()
  const [datos, setDatos] = useState(null) // { resumen, previo, fila }
  const [falla, setFalla] = useState(false)
  const [editando, setEditando] = useState(false)
  const esSubgerente = profile?.rol === 'subgerente'
  const [hoy] = useState(() => fechaChile())

  const cargar = useCallback(async () => {
    const [r, previo, fila] = await Promise.all([
      supabase.rpc('meta_anual_resumen', { p_anio: hoy.anio }),
      supabase.rpc('meta_anual_resumen', { p_anio: hoy.anio - 1 }),
      supabase.from('metas_anuales').select('*').eq('anio', hoy.anio).maybeSingle(),
    ])
    // Si algo no está disponible (por ejemplo, la base aún no tiene la meta), la tarjeta no se muestra
    // y el resto de la pantalla sigue funcionando.
    if (r.error || previo.error || fila.error) { setFalla(true); return }
    setFalla(false)
    setDatos({ resumen: r.data, previo: previo.data, fila: fila.data ?? null })
  }, [hoy.anio])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  if (falla || !datos) return null

  const { resumen, previo, fila } = datos
  const m = calcularMeta({ hoy, totalAnio: resumen.total, totalAnioAnterior: previo.total, fila })
  const veTodo = profile?.rol === 'administrador' || esSubgerente

  // ── Sin cifra del año anterior: la meta aún no existe ──
  if (!m.meta) {
    return (
      <div style={card}>
        <p style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>🎯 Meta de ventas {m.anio}</p>
        <p style={{ fontSize: '13px', color: 'var(--text3)', lineHeight: 1.5 }}>
          {esSubgerente
            ? `Aún no hay meta para ${m.anio}. Ingresa las planchas vendidas en ${m.anio - 1} para activarla.`
            : `La meta de ${m.anio} se activará cuando el subgerente ingrese las ventas de ${m.anio - 1}.`}
        </p>
        {esSubgerente && (
          <button onClick={() => setEditando(true)}
            style={{ marginTop: '12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600 }}>
            Configurar meta
          </button>
        )}
        {editando && <ConfigurarMeta anio={m.anio} fila={fila} vendidasSistema={previo.total} onCerrar={() => setEditando(false)} onGuardado={cargar} />}
      </div>
    )
  }

  const pctBarra = Math.min(100, Math.max(0, m.avancePct))
  const aporte = resumen.mis_planchas ?? 0
  const aportePct = resumen.total > 0 ? Math.round((aporte / resumen.total) * 100) : 0

  const mensaje = m.completada
    ? '🏆 ¡Meta cumplida! Felicitaciones a todo el equipo.'
    : m.siguienteHito
      ? `${m.hitoAlcanzado ? `${m.hitoAlcanzado.icono} ${m.hitoAlcanzado.nombre} logrado. ` : '¡Vamos! '}Faltan ${nf(m.faltanSiguienteHito)} planchas para el ${m.siguienteHito.icono} ${m.siguienteHito.pct}%.`
      : ''

  return (
    <div style={card}>
      {m.completada && <Confeti />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <p style={{ fontSize: '15px', fontWeight: 700 }}>🎯 Meta de ventas {m.anio}</p>
        {esSubgerente && (
          <button onClick={() => setEditando(true)}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '5px 12px', fontSize: '12px' }}>
            ✏️ Cambiar meta
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <span style={{ fontSize: '30px', fontWeight: 800, color: m.completada ? 'var(--green)' : 'var(--primary)', lineHeight: 1.1 }}><NumeroAnimado valor={m.total} duracion={1000} formato={nf} /></span>
        <span style={{ fontSize: '14px', color: 'var(--text2)' }}>de {nf(m.meta)} planchas</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: m.completada ? 'var(--green)' : 'var(--text1)' }}>{m.avancePct.toLocaleString('es-CL')}%</span>
      </div>

      {/* Barra con los hitos 25 / 50 / 75 / 100 % */}
      <div style={{ position: 'relative', paddingTop: '22px', marginBottom: '8px' }}>
        {HITOS.map(h => (
          <span key={h.pct} title={`${h.nombre} (${h.pct}%)`}
            style={{ position: 'absolute', top: 0, left: `${h.pct}%`, transform: 'translateX(-100%)', fontSize: '16px', lineHeight: 1, filter: m.avancePct >= h.pct ? 'none' : 'grayscale(1)', opacity: m.avancePct >= h.pct ? 1 : 0.4 }}>
            {h.icono}
          </span>
        ))}
        <div style={{ background: 'var(--bg3)', borderRadius: '99px', height: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div className="meta-barra" role="progressbar" aria-valuenow={Math.round(pctBarra)} aria-valuemin={0} aria-valuemax={100}
            style={{ height: '100%', width: `${pctBarra}%`, borderRadius: '99px', background: m.completada ? 'var(--green)' : 'linear-gradient(90deg, var(--primary), #ff4b57)' }} />
        </div>
      </div>

      {mensaje && <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text1)', margin: '10px 0 12px' }}>{mensaje}</p>}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {!m.completada && <Dato icono="🟫" titulo="Faltan" valor={`${nf(m.faltan)} planchas`} />}
        <Dato icono="📅" titulo="Quedan" valor={`${m.diasRestantes} día${m.diasRestantes === 1 ? '' : 's'}`} detalle={`hasta el 31 de diciembre de ${m.anio}`} />
        {m.ritmoNecesarioDia !== null && (
          <Dato icono="⚡" titulo="Ritmo necesario" valor={`${m.ritmoNecesarioDia.toLocaleString('es-CL')} por día`} detalle={`≈ ${Math.ceil(m.ritmoNecesarioSemana).toLocaleString('es-CL')} por semana`} />
        )}
      </div>

      {m.enCamino === true && !m.completada && (
        <p style={{ fontSize: '13px', color: 'var(--green)', marginBottom: '8px' }}>✅ A este ritmo (~{m.ritmoActualDia.toLocaleString('es-CL')} por día) se cumple la meta: cerraríamos {m.anio} con unas {nf(m.proyeccionCierre)} planchas.</p>
      )}
      {m.enCamino === false && (
        <p style={{ fontSize: '13px', color: 'var(--amber)', marginBottom: '8px' }}>⚠️ A este ritmo (~{m.ritmoActualDia.toLocaleString('es-CL')} por día) cerraríamos con unas {nf(m.proyeccionCierre)} planchas. Hay que subir a ~{m.ritmoNecesarioDia?.toLocaleString('es-CL')} por día.</p>
      )}

      {aporte > 0 && (
        <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>
          🙌 <strong>Tu aporte:</strong> {nf(aporte)} planchas{resumen.total > 0 ? ` (${aportePct}% de lo vendido)` : ''}.
        </p>
      )}

      {/* Ventas por mes */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '46px', marginTop: '10px' }} aria-label="Planchas vendidas por mes">
        {(resumen.por_mes ?? []).map((v, i) => {
          const max = Math.max(1, ...resumen.por_mes)
          return (
            <div key={i} title={`${MESES[i]}: ${nf(v)} planchas`} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: `${Math.max(2, (v / max) * 32)}px`, background: i + 1 === hoy.mes ? 'var(--primary)' : 'rgba(227,6,19,0.28)', borderRadius: '3px 3px 0 0' }} />
              <span style={{ fontSize: '9px', color: 'var(--text3)' }}>{MESES[i]}</span>
            </div>
          )
        })}
      </div>

      {veTodo && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '14px', paddingTop: '10px', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6 }}>
          <p>Base: {nf(m.base)} planchas vendidas en {m.anio - 1} ({m.origenBase === 'manual' ? 'cifra ingresada por el subgerente' : 'ventas registradas en el sistema'}) + {m.porcentaje}% = meta {nf(m.meta)}.</p>
          {m.metaSiguiente && (
            <p>📈 Si cerramos {m.anio} con ~{nf(m.proyeccionCierre)} planchas, la meta de {m.anio + 1} sería de unas <strong>{nf(m.metaSiguiente)}</strong>. En enero se calculará sola con las ventas reales.</p>
          )}
        </div>
      )}

      {editando && <ConfigurarMeta anio={m.anio} fila={fila} vendidasSistema={previo.total} onCerrar={() => setEditando(false)} onGuardado={cargar} />}
    </div>
  )
}
