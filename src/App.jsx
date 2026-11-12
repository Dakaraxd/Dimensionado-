import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ResetPassword from './pages/ResetPassword'

function ProtectedRoute({ children, roles }) {
  const { user, profile, loading, signOut } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Cargando...</p>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center" style={{ flexDirection: 'column', gap: '12px' }}>
      <p className="text-red-500">No se pudo cargar tu perfil. Intenta de nuevo o contacta al administrador.</p>
      <button onClick={signOut}
        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
        Cerrar sesión
      </button>
    </div>
  )

  if (profile.activo === false) return (
    <div className="min-h-screen flex items-center justify-center" style={{ flexDirection: 'column', gap: '12px', textAlign: 'center', padding: '0 16px' }}>
      <p className="text-red-500">Tu cuenta está desactivada. Contacta al administrador.</p>
      <button onClick={signOut}
        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
        Cerrar sesión
      </button>
    </div>
  )

  if (roles && !roles.includes(profile?.rol)) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-red-500">No tienes permisos para ver esta página.</p>
    </div>
  )

  return children
}

export default function App() {
  const { user, recuperandoPassword } = useAuth()

  if (recuperandoPassword) return <ResetPassword />

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Dashboard key={user?.id} />
        </ProtectedRoute>
      } />
    </Routes>
  )
}