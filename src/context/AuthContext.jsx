import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recuperandoPassword, setRecuperandoPassword] = useState(false)

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) console.error('No se pudo cargar el perfil:', error.message)
    setProfile(data)
    setLoading(false)
  }

  useEffect(() => {
    // Sesión activa al cargar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // Escucha cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecuperandoPassword(true)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    // scope local: cerrar sesión en este equipo no debe cerrar la sesión de la persona en sus otros dispositivos
    await supabase.auth.signOut({ scope: 'local' })
  }

  async function actualizarPassword(nuevaPassword) {
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword })
    if (!error) setRecuperandoPassword(false)
    return { error }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, recuperandoPassword, actualizarPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)