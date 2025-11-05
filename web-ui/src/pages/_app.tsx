import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { Inter } from 'next/font/google'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { wsClient } from '@/lib/websocket'
import { useAuthStore } from '@/stores/auth-store'

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

  useEffect(() => {
    setMounted(true)

    // Initialize auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    // Listen to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
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
      <div className={`${inter.variable} font-sans`}>
        <Component {...pageProps} />
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--foreground))',
            },
          }}
        />
      </div>
    </QueryClientProvider>
  )
}
