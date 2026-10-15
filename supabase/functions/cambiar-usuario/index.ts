import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { manejar } from './handler.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

Deno.serve((req) => manejar(req, admin))
