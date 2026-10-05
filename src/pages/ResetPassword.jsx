import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function ResetPassword() {
  const { actualizarPassword, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [exito, setExito] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    const { error: err } = await actualizarPassword(password)
    setLoading(false)

    if (err) {
      setError('No se pudo actualizar la contraseña. Vuelve a pedir el link de recuperación.')
    } else {
      setExito(true)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '16px',
        padding: '36px', width: '100%', maxWidth: '400px'
      }}>
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', marginBottom: '16px'
          }}>🔑</div>
          <h1 style={{ fontSize: '20px', fontWeight: '500', color: 'var(--text1)', marginBottom: '4px' }}>
            Nueva contraseña
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Elige una contraseña nueva para tu cuenta</p>
        </div>

        {exito ? (
          <div>
            <div style={{ background: 'var(--green-soft)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--green)' }}>✓ Contraseña actualizada correctamente</p>
            </div>
            <button onClick={signOut}
              style={{ width: '100%', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '500' }}>
              Ir a iniciar sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '6px' }}>
                Contraseña nueva
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} placeholder="Mínimo 8 caracteres"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '6px' }}>
                Confirmar contraseña
              </label>
              <input
                type="password" value={confirmar} onChange={e => setConfirmar(e.target.value)}
                required minLength={8} placeholder="Repite la contraseña"
              />
            </div>

            {error && (
              <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px' }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}
              style={{
                background: loading ? 'var(--bg3)' : 'var(--primary)', color: '#fff', border: 'none',
                borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '500',
                marginTop: '4px', opacity: loading ? 0.7 : 1
              }}>
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
