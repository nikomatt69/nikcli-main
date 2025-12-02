// lib/api-client.ts
// HTTP API client for NikCLI Mobile with authentication

import { z } from 'zod'

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

// Types
export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  userId: string
}

export interface Message {
  type: 'user' | 'assistant' | 'system' | 'tool' | 'error'
  content: string
  timestamp: string
  metadata?: Record<string, any>
}

export interface Session {
  id: string
  userId?: string
  workspaceId?: string
  createdAt: string
  messages: Message[]
}

export interface ApprovalRequest {
  id: string
  type: 'file_change' | 'command_execution' | 'agent_action'
  title: string
  description: string
  details: Record<string, any>
  timestamp: string
}

// Zod schemas for validation
const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  userId: z.string(),
})

const MessageSchema = z.object({
  type: z.enum(['user', 'assistant', 'system', 'tool', 'error']),
  content: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.any()).optional(),
})

const SessionSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  workspaceId: z.string().optional(),
  createdAt: z.string(),
  messages: z.array(MessageSchema),
})

/**
 * API Client for NikCLI Mobile
 */
export class APIClient {
  private baseURL: string
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private refreshPromise: Promise<void> | null = null

  constructor(baseURL: string = API_URL) {
    this.baseURL = baseURL

    // Load tokens from localStorage if available
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('nikcli_access_token')
      this.refreshToken = localStorage.getItem('nikcli_refresh_token')
    }
  }

  /**
   * Set authentication tokens
   */
  setTokens(tokens: AuthTokens): void {
    this.accessToken = tokens.accessToken
    this.refreshToken = tokens.refreshToken

    if (typeof window !== 'undefined') {
      localStorage.setItem('nikcli_access_token', tokens.accessToken)
      localStorage.setItem('nikcli_refresh_token', tokens.refreshToken)
      localStorage.setItem('nikcli_user_id', tokens.userId)
    }
  }

  /**
   * Clear authentication tokens
   */
  clearTokens(): void {
    this.accessToken = null
    this.refreshToken = null

    if (typeof window !== 'undefined') {
      localStorage.removeItem('nikcli_access_token')
      localStorage.removeItem('nikcli_refresh_token')
      localStorage.removeItem('nikcli_user_id')
    }
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken
  }

  /**
   * Login
   */
  async login(deviceInfo?: Record<string, any>): Promise<AuthTokens> {
    const response = await this.request<{ success: boolean } & AuthTokens>(
      '/api/mobile/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ deviceInfo }),
      }
    )

    const tokens = AuthTokensSchema.parse(response)
    this.setTokens(tokens)

    return tokens
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    if (this.refreshToken) {
      try {
        await this.request('/api/mobile/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        })
      } catch (error) {
        console.error('Logout error:', error)
      }
    }

    this.clearTokens()
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available')
    }

    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseURL}/api/mobile/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        })

        if (!response.ok) {
          throw new Error('Token refresh failed')
        }

        const data = await response.json()
        const tokens = AuthTokensSchema.parse(data)
        this.setTokens(tokens)
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  /**
   * Send chat message
   */
  async sendMessage(
    message: string,
    sessionId: string,
    options?: {
      workspaceId?: string
      streaming?: boolean
    }
  ): Promise<{ success: boolean; messages: Message[]; sessionId: string }> {
    return this.request('/api/mobile/chat/send', {
      method: 'POST',
      body: JSON.stringify({
        message,
        sessionId,
        workspaceId: options?.workspaceId,
        options: {
          streaming: options?.streaming ?? false,
        },
      }),
    })
  }

  /**
   * Execute slash command
   */
  async executeCommand(
    command: string,
    sessionId: string,
    options?: { workspaceId?: string }
  ): Promise<{ success: boolean; messages: Message[]; sessionId: string }> {
    return this.request('/api/mobile/chat/command', {
      method: 'POST',
      body: JSON.stringify({
        command,
        sessionId,
        workspaceId: options?.workspaceId,
      }),
    })
  }

  /**
   * Create new session
   */
  async createSession(options?: {
    userId?: string
    workspaceId?: string
  }): Promise<{ success: boolean; sessionId: string }> {
    return this.request('/api/mobile/sessions/create', {
      method: 'POST',
      body: JSON.stringify(options),
    })
  }

  /**
   * Get active sessions
   */
  async getSessions(): Promise<{ success: boolean; sessions: Array<{ id: string; messages: number }> }> {
    return this.request('/api/mobile/sessions')
  }

  /**
   * Get session messages
   */
  async getSessionMessages(sessionId: string): Promise<{ success: boolean; messages: Message[] }> {
    return this.request(`/api/mobile/sessions/${sessionId}/messages`)
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<{ success: boolean }> {
    return this.request(`/api/mobile/sessions/${sessionId}`, {
      method: 'DELETE',
    })
  }

  /**
   * Get pending approvals
   */
  async getApprovals(sessionId: string): Promise<{ success: boolean; approvals: ApprovalRequest[] }> {
    return this.request(`/api/mobile/approvals?sessionId=${sessionId}`)
  }

  /**
   * Respond to approval
   */
  async respondToApproval(
    id: string,
    approved: boolean,
    reason?: string
  ): Promise<{ success: boolean }> {
    return this.request('/api/mobile/approvals/respond', {
      method: 'POST',
      body: JSON.stringify({ id, approved, reason }),
    })
  }

  /**
   * Health check
   */
  async health(): Promise<{ success: boolean; status: string }> {
    return this.request('/api/mobile/health')
  }

  /**
   * Make authenticated request
   */
  private async request<T = any>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${path}`

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    // Add auth header if authenticated
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }

    let response = await fetch(url, {
      ...options,
      headers,
    })

    // Handle 401 - try to refresh token
    if (response.status === 401 && this.refreshToken) {
      try {
        await this.refreshAccessToken()

        // Retry request with new token
        headers['Authorization'] = `Bearer ${this.accessToken}`
        response = await fetch(url, {
          ...options,
          headers,
        })
      } catch (error) {
        // Refresh failed, clear tokens and re-throw
        this.clearTokens()
        throw new Error('Authentication expired. Please login again.')
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'UNKNOWN_ERROR',
        message: response.statusText,
      }))

      throw new APIError(
        error.message || 'Request failed',
        response.status,
        error.error
      )
    }

    return response.json()
  }
}

/**
 * API Error class
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message)
    this.name = 'APIError'
  }
}

// Singleton instance
export const apiClient = new APIClient()
