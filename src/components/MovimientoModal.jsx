import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Modal } from './CuentasRapidas'
import { TIPOS_MOVIMIENTO } from '../lib/movimientos'

const label = { display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }

// Los triggers de la base entregan mensajes claros; el resto se resume
function mensajeDe(err) {
  const m = err?.message ?? ''
  return /Stock insuficiente|mayor que lo vendido|No existe stock/i.test(m) ? m : 'No se pudo registrar el movimiento. Intenta de nuevo.'
}

// stocks: filas de vista_stock_general · sinStock: tipos de plancha que aún no tienen stock
export default function MovimientoModal({ stocks, sinStock = [], inicial, onCerrar, onGuardado }) {
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'ingreso')
  const [planchaId, setPlanchaId] = useState(inicial?.tipo_plancha_id ?? '')
  const [cantidad, setCantidad] = useState('')
  const [nuevoTotal, setNuevoTotal] = useState('')
  const [motivo, setMotivo] = useState('')
  const [referencia, setReferencia] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const t = TIPOS_MOVIMIENTO[tipo]
  const s = stocks.find(x => x.tipo_plancha_id === planchaId) ?? null
  const esNuevo = !s && sinStock.some(x => x.id === planchaId)

  // Cambio sobre lo disponible según el tipo de movimiento
  const entero = (v) => (/^\d+$/.test(v) ? parseInt(v, 10) : NaN)
  let delta = NaN
  if (tipo === 'ajuste') delta = s && /^\d+$/.test(nuevoTotal) ? entero(nuevoTotal) - s.total : NaN
  else if (tipo === 'merma') delta = -entero(cantidad)
  else delta = entero(cantidad)
  const disponibleAntes = s ? s.disponible : 0
  const disponibleDespues = Number.isNaN(delta) ? null : disponibleAntes + delta

  function validar() {
    if (!planchaId) return 'Elige la plancha'
    if (tipo === 'ajuste') {
      if (!s) return 'Solo se puede ajustar una plancha que ya tiene stock'
      if (!/^\d+$/.test(nuevoTotal)) return 'Ingresa el total contado (un número entero)'
      if (entero(nuevoTotal) < s.vendido) return `El total no puede ser menor que lo vendido (${s.vendido})`
      if (delta === 0) return 'El total contado es igual al actual: no hay nada que ajustar'
    } else {
      const c = entero(cantidad)
      if (!c || c < 1) return 'La cantidad debe ser un número entero mayor que 0'
      if (tipo === 'merma' && (!s || c > s.disponible)) return `Solo hay ${s?.disponible ?? 0} planchas disponibles`
      if (tipo === 'devolucion' && (!s || c > s.vendido)) return `La devolución no puede superar lo vendido (${s?.vendido ?? 0})`
    }
    if (t.exigeMotivo && motivo.trim().length < 3) return 'Indica el motivo (mínimo 3 letras)'
    return ''
  }

  async function guardar(e) {
    e.preventDefault()
    const problema = validar()
    if (problema) { setError(problema); return }
    setGuardando(true)
    setError('')
    const { error: err } = await supabase.from('movimientos_inventario').insert({
      tipo_plancha_id: planchaId,
      tipo,
      cantidad: tipo === 'ajuste' ? delta : entero(cantidad),
      motivo: motivo.trim() || null,
      referencia: referencia.trim() || null,
    })
    setGuardando(false)
    if (err) { setError(mensajeDe(err)); return }
    onGuardado?.()
    onCerrar()
  }

  const opciones = tipo === 'ingreso'
    ? [...stocks.map(x => ({ id: x.tipo_plancha_id, texto: `${x.plancha_nombre} ${x.plancha_medida ?? ''} — ${x.disponible} disp.` })),
       ...sinStock.map(x => ({ id: x.id, texto: `${x.nombre} ${x.medida ?? ''} — sin stock aún` }))]
    : stocks.map(x => ({ id: x.tipo_plancha_id, texto: `${x.plancha_nombre} ${x.plancha_medida ?? ''} — ${x.disponible} disp.` }))

  return (
    <Modal titulo="Registrar movimiento de inventario" onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '14px' }}>Registrar movimiento</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '8px' }}>
          {Object.entries(TIPOS_MOVIMIENTO).map(([k, v]) => (
            <button key={k} type="button" onClick={() => { setTipo(k); setError(''); if (k !== 'ingreso' && esNuevo) setPlanchaId('') }}
              style={{
                padding: '9px 8px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                border: `2px solid ${tipo === k ? v.color : 'var(--border)'}`,
                background: tipo === k ? v.soft : 'var(--bg2)', color: tipo === k ? v.color : 'var(--text2)'
              }}>
              {v.icono} {v.nombre}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '14px' }}>{t.ayuda}</p>

        <label style={label}>Plancha *</label>
        <select value={planchaId} onChange={e => { setPlanchaId(e.target.value); setError('') }} style={{ marginBottom: '12px' }}>
          <option value="">Selecciona...</option>
          {opciones.map(o => <option key={o.id} value={o.id}>{o.texto}</option>)}
        </select>

        {tipo === 'ajuste' ? (
          <>
            <label style={label}>Total contado *{s ? ` (hoy el sistema tiene ${s.total}; ${s.vendido} vendidas)` : ''}</label>
            <input type="text" inputMode="numeric" value={nuevoTotal} placeholder="Ej: 98"
              onChange={e => setNuevoTotal(e.target.value.replace(/\D/g, ''))} style={{ marginBottom: '12px' }} />
          </>
        ) : (
          <>
            <label style={label}>Cantidad de planchas *</label>
            <input type="text" inputMode="numeric" value={cantidad} placeholder="Ej: 10"
              onChange={e => setCantidad(e.target.value.replace(/\D/g, ''))} style={{ marginBottom: '12px' }} />
          </>
        )}

        <label style={label}>Motivo {t.exigeMotivo ? '*' : '(opcional)'}</label>
        <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} style={{ marginBottom: '12px' }}
          placeholder={tipo === 'merma' ? 'Ej: golpeadas en bodega' : tipo === 'devolucion' ? 'Ej: cliente devolvió por color' : tipo === 'ajuste' ? 'Ej: conteo físico de fin de mes' : 'Ej: compra a proveedor'} />

        <label style={label}>Referencia (opcional)</label>
        <input type="text" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Nº de guía, factura o boleta" />

        {disponibleDespues !== null && planchaId && (
          <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '10px 14px', marginTop: '14px', fontSize: '13px' }}>
            Disponible: <strong>{disponibleAntes}</strong> → <strong style={{ color: disponibleDespues < 0 ? 'var(--red)' : t.color }}>{disponibleDespues}</strong>
            <span style={{ color: 'var(--text3)' }}> ({delta > 0 ? '+' : ''}{delta})</span>
          </div>
        )}

        {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
            style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 18px', fontSize: '14px' }}>Cancelar</button>
          <button type="submit" disabled={guardando}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 22px', fontSize: '14px', fontWeight: 600, opacity: guardando ? 0.7 : 1 }}>
            {guardando ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
