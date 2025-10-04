'use client'

import { useEffect, useState, useCallback } from 'react'

export interface WebSocketMessage {
    type: string
    data: any
    timestamp: Date
    clientId?: string
}

export function useWebSocket(url: string = 'ws://localhost:3000/ws') {
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [ws, setWs] = useState<WebSocket | null>(null)
    const [reconnectAttempts, setReconnectAttempts] = useState(0)

    const connect = useCallback(() => {
        try {
            const websocket = new WebSocket(url)

            websocket.onopen = () => {
                setIsConnected(true)
                setReconnectAttempts(0)
                console.log('✅ WebSocket connected')
            }

            websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    setLastMessage(data)
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error)
                }
            }

            websocket.onerror = (error) => {
                console.error('❌ WebSocket error:', error)
            }

            websocket.onclose = () => {
                setIsConnected(false)
                console.log('🔌 WebSocket disconnected')

                // Exponential backoff reconnection
                const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
                setTimeout(() => {
                    setReconnectAttempts((prev) => prev + 1)
                    connect()
                }, timeout)
            }

            setWs(websocket)
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error)
        }
    }, [url, reconnectAttempts])

    useEffect(() => {
        connect()

        return () => {
            if (ws) {
                ws.close()
            }
        }
    }, [connect])

    const sendMessage = useCallback(
        (message: any) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message))
            } else {
                console.warn('WebSocket not connected. Cannot send message.')
            }
        },
        [ws]
    )

    return { lastMessage, isConnected, sendMessage, ws }
}

