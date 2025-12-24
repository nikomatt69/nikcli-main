/**
 * API Response Types
 */

export interface APIResponse<T = unknown> {
  success: boolean
  data?: T
  error?: APIError
  metadata?: ResponseMetadata
}

export interface APIError {
  code: string
  message: string
  details?: unknown
  timestamp: Date | string
}

export interface ResponseMetadata {
  page?: number
  limit?: number
  total?: number
  hasMore?: boolean
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

export interface WebSocketMessage<T = unknown> {
  type: string
  data: T
  timestamp: Date | string
  clientId?: string
}

export interface SSEEvent<T = unknown> {
  type: 'log' | 'job' | 'heartbeat' | 'error'
  data: T
}
