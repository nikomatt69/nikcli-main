import Link from 'next/link'
import { useRouter } from 'next/router'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import {
  Terminal,
  Activity,
  MessageSquare,
  FolderOpen,
  Settings,
  Slack,
  LogOut,
} from 'lucide-react'
import { signOut } from '@/lib/supabase'
import { toast } from 'sonner'

const navigationItems = [
  { name: 'Jobs', href: '/', icon: Activity },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Workspace', href: '/workspace', icon: FolderOpen },
  { name: 'Slack', href: '/slack', icon: Slack },
  { name: 'Settings', href: '/settings', icon: Settings },
]

interface SidebarProps {
  onClose?: () => void
}

export default function Sidebar({ onClose }: SidebarProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Signed out successfully')
      router.push('/login')
    } catch (error) {
      toast.error('Failed to sign out')
    }
  }

  if (!mounted) {
    return (
      <aside className="flex w-64 flex-col rounded-2xl overflow-hidden bg-card/95 border border-border/50" style={{ height: '100%' }}>
        <div className="flex h-16 items-center gap-3 border-b border-border/30 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
            <Terminal className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">NikCLI</h1>
            <p className="text-xs text-muted-foreground">Web UI</p>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="flex w-64 flex-col rounded-2xl overflow-hidden bg-card/95 border border-border/50"
      style={{
        height: '100%',
        boxShadow: `
          0 20px 60px hsl(var(--background) / 0.5),
          0 10px 30px hsl(var(--background) / 0.3),
          0 0 0 1px hsl(var(--border) / 0.5),
          inset 0 1px 0 hsl(var(--foreground) / 0.05)
        `,
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border/30 px-6 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 shadow-lg shadow-primary/20 border border-primary/10">
          <Terminal className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">NikCLI</h1>
          <p className="text-xs text-muted-foreground">Web UI</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navigationItems.map((item) => {
          const Icon = item.icon
          const isActive = router.pathname === item.href

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => {
                onClose?.()
              }}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium relative',
                isActive
                  ? 'bg-gradient-to-r from-primary/15 to-accent/10 text-primary shadow-lg border border-primary/20'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.name}</span>
              {isActive && (
                <div className="ml-auto h-2 w-2 rounded-full bg-primary shadow-lg shadow-primary/50" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border/30 p-4 bg-gradient-to-t from-background/20 to-transparent">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-start gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
