import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [modoRecuperar, setModoRecuperar] = useState(false)
  const [recuperarEnviado, setRecuperarEnviado] = useState(false)
  const [recuperando, setRecuperando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError('Correo o contraseña incorrectos')
    setLoading(false)
  }

  async function handleRecuperar(e) {
    e.preventDefault()
    setError('')
    setRecuperando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })
    setRecuperando(false)
    // No revelar si el correo existe o no: mismo mensaje en ambos casos.
    if (!error || error.message?.toLowerCase().includes('rate limit')) {
      setRecuperarEnviado(true)
    } else {
      setError('No se pudo enviar el correo de recuperación. Intenta de nuevo más tarde.')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '36px',
        width: '100%',
        maxWidth: '400px'
      }}>
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'var(--primary)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', marginBottom: '16px'
          }}>🪵</div>
          <h1 style={{ fontSize: '20px', fontWeight: '500', color: 'var(--text1)', marginBottom: '4px' }}>
            Dimensionado
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Home Center — Inicia sesión</p>
        </div>

        {modoRecuperar ? (
          recuperarEnviado ? (
            <div>
              <div style={{ background: 'var(--green-soft)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--green)' }}>
                  Si el correo está registrado, te llegará un link para restablecer tu contraseña. Revisa también spam.
                </p>
              </div>
              <button onClick={() => { setModoRecuperar(false); setRecuperarEnviado(false) }}
                style={{ width: '100%', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '10px', fontSize: '13px' }}>
                Volver a iniciar sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleRecuperar} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '6px' }}>
                  Correo
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required placeholder="correo@ejemplo.com"
                />
              </div>

              {error && (
                <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px' }}>
                  {error}
                </p>
              )}

              <button type="submit" disabled={recuperando}
                style={{ background: recuperando ? 'var(--bg3)' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: '500', opacity: recuperando ? 0.7 : 1 }}>
                {recuperando ? 'Enviando...' : 'Enviar link de recuperación'}
              </button>
              <button type="button" onClick={() => { setModoRecuperar(false); setError('') }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '12px' }}>
                Volver a iniciar sesión
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '6px' }}>
                Correo
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '6px' }}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p style={{ fontSize: '13px', color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: '8px' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? 'var(--bg3)' : 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px',
                fontSize: '14px',
                fontWeight: '500',
                marginTop: '4px',
                opacity: loading ? 0.7 : 1,
                transition: 'background 0.15s'
              }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

            <button type="button" onClick={() => { setModoRecuperar(true); setError('') }}
              style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '12px', alignSelf: 'center' }}>
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}
      </div>
    </div>
  )
}