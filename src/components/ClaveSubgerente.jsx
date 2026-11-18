import { useState } from 'react'
import { Modal } from './CuentasRapidas'
import { definirClave } from '../lib/autorizacion'

const label = { display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }

// El subgerente crea (o cambia) su clave personal de autorización de stock
export default function ClaveSubgerente({ tieneClave, onCerrar, onListo }) {
  const [actual, setActual] = useState('')
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    if (tieneClave && !actual) { setError('Escribe tu clave actual'); return }
    if (!/^\d{6}$/.test(clave)) { setError('La clave debe tener exactamente 6 números'); return }
    if (/^(\d)\1+$/.test(clave) || '0123456789'.includes(clave) || '9876543210'.includes(clave)) {
      setError('La clave es demasiado evidente (por ejemplo 123456 o 000000). Elige otra')
      return
    }
    if (clave !== repetir) { setError('Las claves no coinciden'); return }
    setCargando(true)
    setError('')
    const res = await definirClave({ clave, claveActual: tieneClave ? actual : undefined })
    setCargando(false)
    if (res.error) { setError(res.error); return }
    onListo?.()
    onCerrar()
  }

  return (
    <Modal titulo="Clave de autorización de stock" onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '6px' }}>🔑 {tieneClave ? 'Cambiar mi clave' : 'Crear mi clave de autorización'}</h3>
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px', lineHeight: 1.5 }}>
          Esta clave se pide cuando alguien registra una <strong>merma</strong> o un <strong>ajuste</strong> de stock. <strong>Es solo tuya: no la compartas ni la escribas donde otros la vean.</strong> Son 6 números, distintos a los de tu PIN y sin ser evidentes (como 123456 o 000000).
        </p>
        {tieneClave && (
          <>
            <label style={label}>Clave actual</label>
            <input type="password" inputMode="numeric" autoComplete="off" autoFocus value={actual} onChange={e => setActual(e.target.value)} style={{ marginBottom: '12px' }} />
          </>
        )}
        <label style={label}>{tieneClave ? 'Clave nueva (6 números)' : 'Clave (6 números)'}</label>
        <input type="password" inputMode="numeric" autoComplete="new-password" autoFocus={!tieneClave} maxLength={6} value={clave}
          onChange={e => setClave(e.target.value.replace(/\D/g, ''))} placeholder="••••••" style={{ marginBottom: '12px' }} />
        <label style={label}>Repite la clave</label>
        <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={repetir}
          onChange={e => setRepetir(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
        {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
          <button type="button" onClick={onCerrar} disabled={cargando}
            style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 18px', fontSize: '14px' }}>Cancelar</button>
          <button type="submit" disabled={cargando}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 22px', fontSize: '14px', fontWeight: 600, opacity: cargando ? 0.7 : 1 }}>
            {cargando ? 'Guardando...' : 'Guardar clave'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
