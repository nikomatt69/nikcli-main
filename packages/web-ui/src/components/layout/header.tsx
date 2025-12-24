import { useAuthStore } from '@/stores/auth-store'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Wifi, WifiOff, Menu } from 'lucide-react'
import { useWebSocketStatus } from '@/hooks/use-websocket-status'

interface HeaderProps {
  onMenuClick?: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, profile } = useAuthStore()
  const isConnected = useWebSocketStatus()

  const userInitials = user?.email
    ?.split('@')[0]
    .slice(0, 2)
    .toUpperCase() || 'U'

  return (
    <header className="flex h-16 items-center justify-between border-b border-border/30 backdrop-blur-sm bg-gradient-to-r from-background/50 to-background/30 px-4 sm:px-6">
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Mobile Menu Button */}
        <div className="lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="h-9 w-9"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <div>
                <Wifi className="h-4 w-4 text-green-400" />
              </div>
              <span className="text-sm text-muted-foreground hidden sm:inline">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-red-400" />
              <span className="text-sm text-muted-foreground hidden sm:inline">Disconnected</span>
            </>
          )}
        </div>

        {/* Theme Toggle */}
        <div>
          <ThemeToggle />
        </div>
      </div>

      {/* User Info */}
      <div className="flex items-center gap-2 sm:gap-4">
        {profile?.subscriptionTier && (
          <Badge
            variant={profile.subscriptionTier === 'pro' ? 'default' : 'secondary'}
            pulse={profile.subscriptionTier === 'pro'}
            className="hidden sm:inline-flex"
          >
            {profile.subscriptionTier.toUpperCase()}
          </Badge>
        )}
        <div className="hidden md:flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{profile?.username || user?.email}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <div
          className="rounded-full"
          style={{
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
          }}
        >
          <Avatar className="ring-2 ring-primary/20 ring-offset-2 ring-offset-background h-9 w-9 sm:h-10 sm:w-10">
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-primary font-semibold text-xs sm:text-sm">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}
