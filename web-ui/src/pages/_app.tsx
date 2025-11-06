import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { wsClient } from '@/lib/websocket'
import { useAuthStore } from '@/stores/auth-store'
import { ThemeProvider } from '@/contexts/theme-context'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

export default function App({ Component, pageProps }: AppProps) {
  const [mounted, setMounted] = useState(false)
  const { setUser, setSession } = useAuthStore()
  const ensuredUserIdRef = useRef<string | null>(null)

  // Ensure a user_profiles row exists for the authenticated user
  const ensureUserProfile = async (user: User | null) => {
    try {
      if (!user) return
      if (ensuredUserIdRef.current === user.id) return

      // Check if profile exists
      const { data: existing, error: selError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (selError && selError.code !== 'PGRST116') {
        // Unexpected error querying profile
        // eslint-disable-next-line no-console
        console.warn('Failed to query user profile:', selError)
        return
      }

      if (!existing) {
        const defaultPreferences = {
          api_keys: {},
          settings: {
            dark_mode: true,
            auto_save: true,
            notifications: true,
            sound_effects: false,
            stream_responses: true,
            auto_approve_tools: false,
          },
          security: {
            two_factor: false,
            session_timeout: 30,
            ip_whitelist: '',
            audit_log: true,
          },
          notification_settings: {
            job_complete: true,
            tool_approval: true,
            file_changes: false,
            pull_requests: true,
            email: false,
            slack: true,
          },
        }

        const { error: insError } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            preferences: defaultPreferences,
            updated_at: new Date().toISOString(),
          })

        if (insError) {
          // eslint-disable-next-line no-console
          console.warn('Failed to initialize user profile:', insError)
          return
        }
      }

      ensuredUserIdRef.current = user.id
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('ensureUserProfile error:', err)
    }
  }

  useEffect(() => {
    setMounted(true)

    // Initialize auth state
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      await ensureUserProfile(session?.user ?? null)
    })

    // Listen to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      await ensureUserProfile(session?.user ?? null)
    })

    // Connect to WebSocket
    wsClient.connect().catch(console.error)

    return () => {
      subscription.unsubscribe()
      wsClient.disconnect()
    }
  }, [setUser, setSession])

  if (!mounted) {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <div className={`${inter.variable} font-sans`}>
          <Component {...pageProps} />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              },
            }}
          />
        </div>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
