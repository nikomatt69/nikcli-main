'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: any }>
  signUp: (email: string, password: string) => Promise<{ error?: any }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => { },
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const client = getSupabase()

    if (!client) {
      // Supabase not configured; render signed-out state without crashing
      setLoading(false)
      return
    }
    // Get initial session
    client.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const client = getSupabase()
    if (!client) return { error: new Error('Supabase is not configured') }
    const { error } = await client.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signUp = async (email: string, password: string) => {
    const client = getSupabase()
    if (!client) return { error: new Error('Supabase is not configured') }
    const { error } = await client.auth.signUp({
      email,
      password,
    })
    return { error }
  }

  const signOut = async () => {
    const client = getSupabase()
    if (!client) return
    await client.auth.signOut()
  }

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
