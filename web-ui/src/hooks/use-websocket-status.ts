import { useEffect, useState } from 'react'
import { wsClient } from '@/lib/websocket'

export function useWebSocketStatus(): boolean {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // Initial status
    setIsConnected(wsClient.isConnected)

    // Listen to connection changes
    const unsubscribeOpen = wsClient.onOpen(() => setIsConnected(true))
    const unsubscribeClose = wsClient.onClose(() => setIsConnected(false))

    return () => {
      unsubscribeOpen()
      unsubscribeClose()
    }
  }, [])

  return isConnected
}
