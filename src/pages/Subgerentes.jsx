import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { registrarLog } from '../lib/logger'
import { listarCuentasSubgerente, cambiarEstadoSubgerente } from '../lib/autorizacion'

const label = { display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }

// Solo para subgerentes: las cuentas de subgerente las crean y gestionan ellos (el administrador no)
export default function Subgerentes() {
  const { user } = useAuth()
  const [cuentas, setCuentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', password: '' })
  const [creando, setCreando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  async function cargar() {
    const r = await listarCuentasSubgerente()
    setCuentas(r.subgerentes)
    if (r.error) setError(r.error)
    setCargando(false)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [])

  async function crear(e) {
    e.preventDefault()
    setErrorForm('')
    setExito('')
    if (form.password.length < 8) { setErrorForm('La contraseña debe tener al menos 8 caracteres'); return }
    setCreando(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setErrorForm('Tu sesión expiró. Vuelve a iniciar sesión.'); setCreando(false); return }
    let resultado
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear-usuario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...form, rol: 'subgerente' }),
      })
      resultado = res.ok ? await res.json() : { ok: false, error: `Error del servidor (${res.status})` }
    } catch {
      resultado = { ok: false, error: 'No se pudo conectar con el servidor' }
    }
    setCreando(false)
    if (!resultado.ok) { setErrorForm(resultado.error ?? 'Error al crear la cuenta'); return }
    await registrarLog({ accion: 'CREAR', entidad: 'usuario', detalle: { nombre: form.nombre, email: form.email, rol: 'subgerente' } })
    setExito(`Cuenta de ${form.nombre} creada. Debe iniciar sesión y crear su clave de stock.`)
    setForm({ nombre: '', email: '', password: '' })
    setMostrarForm(false)
    cargar()
  }

  async function cambiarEstado(c) {
    const nuevo = !c.activo
    if (!nuevo && !confirm(`¿Desactivar la cuenta de ${c.nombre}? Ya no podrá iniciar sesión ni autorizar cambios de stock.`)) return
    setError('')
    setExito('')
    const res = await cambiarEstadoSubgerente(c.id, nuevo)
    if (res.error) { setError(res.error); return }
    setExito(`Cuenta de ${c.nombre} ${nuevo ? 'activada' : 'desactivada'}`)
    cargar()
  }

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px' }}>Subgerentes</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Solo un subgerente puede crear y gestionar estas cuentas. El administrador no.</p>
        </div>
        <button onClick={() => { setMostrarForm(!mostrarForm); setErrorForm(''); setExito('') }}
          style={{ background: mostrarForm ? 'var(--bg3)' : 'var(--primary)', color: mostrarForm ? 'var(--text2)' : '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500' }}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo subgerente'}
        </button>
      </div>

      {exito && (
        <div style={{ background: 'var(--green-soft)', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--green)' }}>✓ {exito}</p>
        </div>
      )}
      {error && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px' }}>{error}</p>}

      {mostrarForm && (
        <form onSubmit={crear} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '500', marginBottom: '16px' }}>Nuevo subgerente</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div>
              <label style={label}>Nombre</label>
              <input type="text" required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre y apellido" />
            </div>
            <div>
              <label style={label}>Correo</label>
              <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" />
            </div>
            <div>
              <label style={label}>Contraseña de acceso (temporal)</label>
              <input type="password" required minLength={8} autoComplete="new-password" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 8 caracteres" />
            </div>
          </div>
          {errorForm && <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '12px' }}>{errorForm}</p>}
          <button type="submit" disabled={creando}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: '500', marginTop: '16px', opacity: creando ? 0.7 : 1 }}>
            {creando ? 'Creando...' : 'Crear cuenta'}
          </button>
        </form>
      )}

      {cargando ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando...</p>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'auto' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['Nombre', 'Correo', 'Clave de stock', 'Estado', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cuentas.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)', opacity: c.activo ? 1 : 0.6 }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{c.nombre}{c.id === user?.id ? ' (tú)' : ''}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text3)' }}>{c.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: 500,
                      background: c.tiene_clave ? 'var(--green-soft)' : 'var(--amber-soft)', color: c.tiene_clave ? 'var(--green)' : 'var(--amber)' }}>
                      {c.tiene_clave ? 'Creada' : 'Pendiente'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: 500,
                      background: c.activo ? 'var(--green-soft)' : 'var(--red-soft)', color: c.activo ? 'var(--green)' : 'var(--red)' }}>
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    {c.id !== user?.id && (
                      <button onClick={() => cambiarEstado(c)}
                        style={{ background: 'transparent', border: '1px solid var(--border)', color: c.activo ? 'var(--red)' : 'var(--green)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px' }}>
                        {c.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
