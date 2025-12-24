import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios'
import { supabase } from './supabase'
import type { APIResponse } from '@/types/api'

/**
 * API Client for NikCLI Backend
 */
class APIClient {
  private client: AxiosInstance

  constructor() {
    const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor: Add auth token
    this.client.interceptors.request.use(
      async (config) => {
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.access_token) {
          config.headers.Authorization = `Bearer ${session.access_token}`
        }

        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor: Handle authentication errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        // Handle 401 unauthorized - redirect to login
        if (error.response?.status === 401) {
          await supabase.auth.signOut()
          window.location.href = '/login'
          return Promise.reject(error) // Reject with original error
        }

        // For other errors, let React Query handle them
        // Don't normalize here - let the methods handle it
        return Promise.reject(error)
      }
    )
  }

  /**
   * Normalize error to APIResponse format
   */
  private normalizeError(error: AxiosError): APIResponse {
    if (error.response) {
      return {
        success: false,
        error: {
          code: String(error.response.status),
          message: (error.response.data as { message?: string })?.message || error.message,
          details: error.response.data,
          timestamp: new Date().toISOString(),
        },
      }
    }

    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
      },
    }
  }

  /**
   * Generic GET request
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<APIResponse<T>> {
    try {
      const response = await this.client.get<T>(url, config)
      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      const normalizedError = this.normalizeError(error as AxiosError) as APIResponse<T>
      // Throw error for React Query to handle retries and error states
      // React Query expects thrown errors, not error objects in responses
      if (!normalizedError.success) {
        const apiError = new Error(normalizedError.error?.message || 'Request failed')
        ;(apiError as any).code = normalizedError.error?.code
        ;(apiError as any).details = normalizedError.error?.details
        throw apiError
      }
      return normalizedError
    }
  }

  /**
   * Generic POST request
   */
  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<APIResponse<T>> {
    try {
      const response = await this.client.post<T>(url, data, config)
      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      const normalizedError = this.normalizeError(error as AxiosError) as APIResponse<T>
      // Throw error for React Query to handle retries and error states
      if (!normalizedError.success) {
        const apiError = new Error(normalizedError.error?.message || 'Request failed')
        ;(apiError as any).code = normalizedError.error?.code
        ;(apiError as any).details = normalizedError.error?.details
        throw apiError
      }
      return normalizedError
    }
  }

  /**
   * Generic PUT request
   */
  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<APIResponse<T>> {
    try {
      const response = await this.client.put<T>(url, data, config)
      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      const normalizedError = this.normalizeError(error as AxiosError) as APIResponse<T>
      // Throw error for React Query to handle retries and error states
      if (!normalizedError.success) {
        const apiError = new Error(normalizedError.error?.message || 'Request failed')
        ;(apiError as any).code = normalizedError.error?.code
        ;(apiError as any).details = normalizedError.error?.details
        throw apiError
      }
      return normalizedError
    }
  }

  /**
   * Generic DELETE request
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<APIResponse<T>> {
    try {
      const response = await this.client.delete<T>(url, config)
      return {
        success: true,
        data: response.data,
      }
    } catch (error) {
      const normalizedError = this.normalizeError(error as AxiosError) as APIResponse<T>
      // Throw error for React Query to handle retries and error states
      if (!normalizedError.success) {
        const apiError = new Error(normalizedError.error?.message || 'Request failed')
        ;(apiError as any).code = normalizedError.error?.code
        ;(apiError as any).details = normalizedError.error?.details
        throw apiError
      }
      return normalizedError
    }
  }

  /**
   * Get raw axios instance for custom requests
   */
  getRawClient(): AxiosInstance {
    return this.client
  }
}

// Export singleton instance
export const apiClient = new APIClient()
export default apiClient
