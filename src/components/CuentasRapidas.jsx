import { useState } from 'react'
import { accederConPin, vincularEquipo, guardarCuenta, cuentaDe } from '../lib/cuentas'

const COLORES = ['#f26b1d', '#2563eb', '#15803d', '#7c3aed', '#db2777', '#0891b2', '#b45309']

export function Avatar({ nombre, tamano = 40 }) {
  const inicial = (nombre ?? '?').trim().charAt(0).toUpperCase() || '?'
  const color = COLORES[[...(nombre ?? '')].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES.length]
  return (
    <div style={{
      width: tamano, height: tamano, borderRadius: '50%', background: color, color: '#fff', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: tamano * 0.45
    }}>{inicial}</div>
  )
}

// Lista de cuentas recordadas en este equipo (como el selector de cuentas de Google)
export function ListaCuentas({ cuentas, actualId, onElegir, onQuitar }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      {cuentas.map((c, i) => {
        const esActual = c.user_id === actualId
        return (
          <div key={c.user_id} style={{ display: 'flex', alignItems: 'center', borderTop: i === 0 ? 'none' : '1px solid var(--border)', background: 'var(--bg2)' }}>
            <button type="button" onClick={() => !esActual && onElegir(c)} disabled={esActual}
              style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'transparent', border: 'none', textAlign: 'left', cursor: esActual ? 'default' : 'pointer', minWidth: 0 }}>
              <Avatar nombre={c.nombre} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text1)' }}>
                  {c.nombre}
                  {esActual && <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 600, color: 'var(--green)', background: 'var(--green-soft)', padding: '2px 8px', borderRadius: '99px' }}>Sesión actual</span>}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</p>
              </div>
            </button>
            {onQuitar && (
              <button type="button" onClick={() => onQuitar(c)} title="Quitar de este equipo" aria-label={`Quitar a ${c.nombre} de este equipo`}
                style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '16px', padding: '0 14px', height: '100%' }}>✕</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function Modal({ titulo, onCerrar, children }) {
  return (
    <div className="modal-fondo" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="modal-caja" role="dialog" aria-modal="true" aria-label={titulo}>
        {children}
      </div>
    </div>
  )
}

const inputPin = { textAlign: 'center', fontSize: '24px', letterSpacing: '0.5em', padding: '12px 8px', fontWeight: 600 }
const btnPrimario = { background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 22px', fontSize: '14px', fontWeight: 600 }
const btnSecundario = { background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 18px', fontSize: '14px' }

// Pide el PIN de la persona y abre su sesión
export function PinDialogo({ cuenta, onCerrar, onExito }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function confirmar(e) {
    e.preventDefault()
    if (!/^\d{4}$/.test(pin)) { setError('Ingresa tu PIN de 4 dígitos'); return }
    setCargando(true)
    setError('')
    const res = await accederConPin(cuenta, pin)
    setCargando(false)
    if (res.error) { setError(res.error); setPin(''); return }
    onExito?.()
    onCerrar()
  }

  return (
    <Modal titulo="Ingresar PIN" onCerrar={onCerrar}>
      <form onSubmit={confirmar} style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}><Avatar nombre={cuenta.nombre} tamano={56} /></div>
        <p style={{ fontSize: '16px', fontWeight: 600 }}>{cuenta.nombre}</p>
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '18px' }}>{cuenta.email}</p>
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '8px' }}>Ingresa tu PIN para continuar</label>
        <input type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={4} value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" style={inputPin} />
        {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '18px' }}>
          <button type="button" onClick={onCerrar} style={btnSecundario} disabled={cargando}>Cancelar</button>
          <button type="submit" style={{ ...btnPrimario, opacity: cargando ? 0.7 : 1 }} disabled={cargando}>{cargando ? 'Verificando...' : 'Continuar'}</button>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '14px' }}>¿Olvidaste tu PIN? Cierra esta ventana e inicia sesión con tu contraseña.</p>
      </form>
    </Modal>
  )
}

// Crea (o cambia) el PIN de la sesión actual y vincula este equipo
export function ConfigurarPin({ usuario, onCerrar, onListo }) {
  const existente = cuentaDe(usuario.id)
  const [pin, setPin] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    if (!/^\d{4}$/.test(pin)) { setError('El PIN debe tener 4 dígitos'); return }
    if (pin !== repetir) { setError('Los PIN no coinciden'); return }
    setCargando(true)
    setError('')
    const res = await vincularEquipo({ pin, secreto: existente?.secreto })
    setCargando(false)
    if (res.error) { setError(res.error); return }
    guardarCuenta({ user_id: usuario.id, nombre: usuario.nombre, email: usuario.email, secreto: res.secreto })
    onListo?.()
    onCerrar()
  }

  return (
    <Modal titulo="PIN de acceso rápido" onCerrar={onCerrar}>
      <form onSubmit={guardar}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '6px' }}>🔐 {existente ? 'Cambiar PIN' : 'Crear PIN de acceso rápido'}</h3>
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px', lineHeight: 1.5 }}>
          Con tu PIN podrás volver a entrar a tu cuenta en <strong>este equipo</strong> sin escribir tu contraseña.
          Es personal: no lo compartas. No elijas uno evidente como 1234 o 0000.
        </p>
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>PIN (4 dígitos)</label>
        <input type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={4} value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" style={inputPin} />
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', margin: '12px 0 6px' }}>Repite el PIN</label>
        <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={repetir}
          onChange={e => setRepetir(e.target.value.replace(/\D/g, ''))} placeholder="••••" style={inputPin} />
        {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
          <button type="button" onClick={onCerrar} style={btnSecundario} disabled={cargando}>Cancelar</button>
          <button type="submit" style={{ ...btnPrimario, opacity: cargando ? 0.7 : 1 }} disabled={cargando}>{cargando ? 'Guardando...' : 'Guardar PIN'}</button>
        </div>
      </form>
    </Modal>
  )
}
