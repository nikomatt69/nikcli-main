import { useAuthStore } from '@/stores/auth-store'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff } from 'lucide-react'
import { useWebSocketStatus } from '@/hooks/use-websocket-status'

export default function Header() {
  const { user, profile } = useAuthStore()
  const isConnected = useWebSocketStatus()

  const userInitials = user?.email
    ?.split('@')[0]
    .slice(0, 2)
    .toUpperCase() || 'U'

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-green-400" />
              <span className="text-sm text-muted-foreground">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-red-400" />
              <span className="text-sm text-muted-foreground">Disconnected</span>
            </>
          )}
        </div>
      </div>

      {/* User Info */}
      <div className="flex items-center gap-4">
        {profile?.subscriptionTier && (
          <Badge variant={profile.subscriptionTier === 'pro' ? 'default' : 'secondary'}>
            {profile.subscriptionTier.toUpperCase()}
          </Badge>
        )}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{profile?.username || user?.email}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Avatar>
            <AvatarFallback className="bg-primary/10 text-primary">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}
