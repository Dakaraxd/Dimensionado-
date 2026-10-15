import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/http.ts'
import { manejar } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autenticado' }, 401)
  const sesion = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await sesion.auth.getUser()
  if (!user) return json({ error: 'No autenticado' }, 401)

  return manejar(req, admin, user.id)
})
