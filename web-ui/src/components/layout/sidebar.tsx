import Link from 'next/link'
import { useRouter } from 'next/router'
import { cn } from '@/lib/utils'
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
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

const navigationItems = [
  { name: 'Jobs', href: '/', icon: Activity },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Workspace', href: '/workspace', icon: FolderOpen },
  { name: 'Slack', href: '/slack', icon: Slack },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar() {
  const router = useRouter()

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Signed out successfully')
      router.push('/login')
    } catch (error) {
      toast.error('Failed to sign out')
    }
  }

  return (
    <aside className="flex w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Terminal className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">NikCLI</h1>
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
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  )
}
