import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  return supabase
}

export async function getCurrentSession() {
  const client = ensureSupabase()
  const { data, error } = await client.auth.getSession()
  if (error) {
    throw error
  }
  return data.session satisfies Session | null
}

export async function signInWithMagicLink(email: string) {
  const client = ensureSupabase()
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href,
    },
  })

  if (error) {
    throw error
  }
}

export async function signOutSupabase() {
  const client = ensureSupabase()
  const { error } = await client.auth.signOut()
  if (error) {
    throw error
  }
}

export function onSupabaseAuthChange(callback: (session: Session | null) => void) {
  const client = ensureSupabase()
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return data.subscription
}
