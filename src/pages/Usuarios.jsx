import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { registrarLog } from '../lib/logger'

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'vendedor' })
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [creando, setCreando] = useState(false)

  useEffect(() => { fetchUsuarios() }, [])

  async function fetchUsuarios() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('creado_en', { ascending: false })
    setUsuarios(data ?? [])
    setLoading(false)
  }

  async function handleCrear(e) {
    e.preventDefault()
    setError('')
    setExito('')
    setCreando(true)

    if (form.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      setCreando(false)
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Tu sesión expiró. Vuelve a iniciar sesión.')
      setCreando(false)
      return
    }

    let result
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear-usuario`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(form)
        }
      )
      result = res.ok ? await res.json() : { ok: false, error: `Error del servidor (${res.status})` }
    } catch {
      result = { ok: false, error: 'No se pudo conectar con el servidor' }
    }

    if (!result.ok) {
      setError(result.error ?? 'Error al crear usuario')
    } else {
      await registrarLog({
        accion: 'CREAR',
        entidad: 'usuario',
        detalle: {
          nombre: form.nombre,
          email: form.email,
          rol: form.rol
        }
      })
      setExito(`Usuario ${form.nombre} creado correctamente`)
      setForm({ nombre: '', email: '', password: '', rol: 'vendedor' })
      setShowForm(false)
      fetchUsuarios()
    }

    setCreando(false)
  }

  const rolColor = {
    administrador: { bg: 'var(--purple-soft)', color: 'var(--purple)' },
    vendedor: { bg: 'var(--blue-soft)', color: 'var(--blue)' },
    solo_lectura: { bg: 'var(--bg3)', color: 'var(--text3)' }
  }

  return (
    <div style={{ color: 'var(--text1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '500', marginBottom: '4px' }}>Usuarios</h2>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>{usuarios.length} usuarios registrados</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setError(''); setExito('') }}
          style={{ background: showForm ? 'var(--bg3)' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500' }}>
          {showForm ? 'Cancelar' : '+ Nuevo usuario'}
        </button>
      </div>

      {exito && (
        <div style={{ background: 'var(--green-soft)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--green)' }}>✓ {exito}</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCrear} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '500', marginBottom: '16px' }}>Nuevo usuario</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Nombre</label>
              <input type="text" required value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Juan Pérez" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Correo</label>
              <input type="email" required value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="correo@ejemplo.com" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Contraseña</label>
              <input type="password" required minLength={8} value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="Mínimo 8 caracteres" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Rol</label>
              <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>
                <option value="vendedor">Vendedor</option>
                <option value="administrador">Administrador</option>
                <option value="solo_lectura">Solo lectura</option>
              </select>
            </div>
          </div>
          {error && (
            <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px', marginTop: '12px' }}>{error}</p>
          )}
          <button type="submit" disabled={creando}
            style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: '500', marginTop: '16px', opacity: creando ? 0.7 : 1 }}>
            {creando ? 'Creando...' : 'Crear usuario'}
          </button>
        </form>
      )}

      {loading ? (
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Cargando usuarios...</p>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['Nombre', 'Correo', 'Rol', 'Desde'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: '500', color: 'var(--text1)' }}>{u.nombre}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text3)' }}>{u.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      background: rolColor[u.rol]?.bg ?? 'var(--bg3)',
                      color: rolColor[u.rol]?.color ?? 'var(--text3)',
                      fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: '500'
                    }}>
                      {u.rol?.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text3)' }}>
                    {new Date(u.creado_en).toLocaleDateString('es-CL')}
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