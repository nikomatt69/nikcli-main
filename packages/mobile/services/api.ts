/**
 * NikCLI Mobile - REST API Service
 * HTTP API communication with nikcli backend
 */

import type { 
  ApiResponse, 
  StatusResponse, 
  AgentInfo, 
  LogEntry,
  ExecutionPlan,
  DiffInfo 
} from '@/types'

interface ApiConfig {
  baseUrl: string
  timeout?: number
}

class ApiServiceImpl {
  private config: ApiConfig = {
    baseUrl: 'http://localhost:3001/api/mobile',
    timeout: 30000,
  }
  
  configure(config: Partial<ApiConfig>): void {
    this.config = { ...this.config, ...config }
  }
  
  // ============================================================================
  // Generic Request Handler
  // ============================================================================
  
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${endpoint}`
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })
      
      clearTimeout(timeoutId)
      
      const data = await response.json()
      
      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP ${response.status}`,
          timestamp: new Date(),
        }
      }
      
      return {
        success: true,
        data,
        timestamp: new Date(),
      }
    } catch (error) {
      clearTimeout(timeoutId)
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      }
    }
  }
  
  // ============================================================================
  // Status Endpoints
  // ============================================================================
  
  async getStatus(): Promise<ApiResponse<StatusResponse>> {
    return this.request<StatusResponse>('/status')
  }
  
  async healthCheck(): Promise<ApiResponse<{ healthy: boolean }>> {
    return this.request<{ healthy: boolean }>('/health')
  }
  
  // ============================================================================
  // Message Endpoints
  // ============================================================================
  
  async sendMessage(content: string): Promise<ApiResponse<{ messageId: string }>> {
    return this.request<{ messageId: string }>('/send', {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  }
  
  async sendCommand(
    command: string, 
    args: string[] = []
  ): Promise<ApiResponse<{ result: unknown }>> {
    return this.request<{ result: unknown }>('/command', {
      method: 'POST',
      body: JSON.stringify({ command, args }),
    })
  }
  
  // ============================================================================
  // Agent Endpoints
  // ============================================================================
  
  async getAgents(): Promise<ApiResponse<AgentInfo[]>> {
    return this.request<AgentInfo[]>('/agents')
  }
  
  async launchAgent(
    agentName: string, 
    task: string
  ): Promise<ApiResponse<{ agentId: string }>> {
    return this.request<{ agentId: string }>('/agents/launch', {
      method: 'POST',
      body: JSON.stringify({ agentName, task }),
    })
  }
  
  async stopAgent(agentId: string): Promise<ApiResponse<{ stopped: boolean }>> {
    return this.request<{ stopped: boolean }>(`/agents/${agentId}/stop`, {
      method: 'POST',
    })
  }
  
  async getAgentStatus(agentId: string): Promise<ApiResponse<AgentInfo>> {
    return this.request<AgentInfo>(`/agents/${agentId}`)
  }
  
  // ============================================================================
  // Log Endpoints
  // ============================================================================
  
  async getLogs(limit = 100): Promise<ApiResponse<LogEntry[]>> {
    return this.request<LogEntry[]>(`/logs?limit=${limit}`)
  }
  
  async clearLogs(): Promise<ApiResponse<{ cleared: boolean }>> {
    return this.request<{ cleared: boolean }>('/logs/clear', {
      method: 'POST',
    })
  }
  
  // ============================================================================
  // Plan Endpoints
  // ============================================================================
  
  async createPlan(prompt: string): Promise<ApiResponse<ExecutionPlan>> {
    return this.request<ExecutionPlan>('/plan', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    })
  }
  
  async approvePlan(planId: string): Promise<ApiResponse<{ approved: boolean }>> {
    return this.request<{ approved: boolean }>(`/plan/${planId}/approve`, {
      method: 'POST',
    })
  }
  
  async rejectPlan(planId: string): Promise<ApiResponse<{ rejected: boolean }>> {
    return this.request<{ rejected: boolean }>(`/plan/${planId}/reject`, {
      method: 'POST',
    })
  }
  
  // ============================================================================
  // Diff Endpoints
  // ============================================================================
  
  async getDiffs(): Promise<ApiResponse<DiffInfo[]>> {
    return this.request<DiffInfo[]>('/diffs')
  }
  
  async acceptDiff(diffId: string): Promise<ApiResponse<{ accepted: boolean }>> {
    return this.request<{ accepted: boolean }>(`/diffs/${diffId}/accept`, {
      method: 'POST',
    })
  }
  
  async rejectDiff(diffId: string): Promise<ApiResponse<{ rejected: boolean }>> {
    return this.request<{ rejected: boolean }>(`/diffs/${diffId}/reject`, {
      method: 'POST',
    })
  }
  
  async acceptAllDiffs(): Promise<ApiResponse<{ accepted: number }>> {
    return this.request<{ accepted: number }>('/diffs/accept-all', {
      method: 'POST',
    })
  }
  
  // ============================================================================
  // Mode Endpoints
  // ============================================================================
  
  async togglePlanMode(): Promise<ApiResponse<{ planMode: boolean }>> {
    return this.request<{ planMode: boolean }>('/mode/plan', {
      method: 'POST',
    })
  }
  
  async toggleAutoAccept(): Promise<ApiResponse<{ autoAccept: boolean }>> {
    return this.request<{ autoAccept: boolean }>('/mode/auto-accept', {
      method: 'POST',
    })
  }
  
  async toggleVmMode(): Promise<ApiResponse<{ vmMode: boolean }>> {
    return this.request<{ vmMode: boolean }>('/mode/vm', {
      method: 'POST',
    })
  }
}

// Singleton instance
export const apiService = new ApiServiceImpl()

export type { ApiConfig }
