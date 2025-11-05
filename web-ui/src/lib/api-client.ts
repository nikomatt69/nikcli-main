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

    // Response interceptor: Handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        // Handle 401 unauthorized
        if (error.response?.status === 401) {
          await supabase.auth.signOut()
          window.location.href = '/login'
        }

        return Promise.reject(this.normalizeError(error))
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
      return this.normalizeError(error as AxiosError) as APIResponse<T>
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
      return this.normalizeError(error as AxiosError) as APIResponse<T>
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
      return this.normalizeError(error as AxiosError) as APIResponse<T>
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
      return this.normalizeError(error as AxiosError) as APIResponse<T>
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
