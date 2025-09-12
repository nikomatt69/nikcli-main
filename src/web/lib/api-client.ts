// API client for Background Agents web interface
import { WebConfig, GitHubRepository, ProjectSnapshot, CreateWebJobRequest, WebBackgroundJob } from '../types';
import { getApiUrl } from './backend-config';

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

class APIClient {
  private baseURL: string;

  constructor() {
    // Connect to the actual NikCLI backend server
    this.baseURL = getApiUrl();
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    try {
      // Check if backend URL is configured
      if (!this.baseURL) {
        return {
          success: false,
          error: 'Backend not configured',
          message: 'NEXT_PUBLIC_API_URL environment variable is not set. Please configure your NikCLI backend server URL.',
        };
      }

      const response = await fetch(`${this.baseURL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Configuration API
  async getConfig(): Promise<APIResponse<{ config: WebConfig }>> {
    return this.request('/web/config');
  }

  async updateConfig(config: Partial<WebConfig>): Promise<APIResponse<{ config: WebConfig }>> {
    return this.request('/web/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // GitHub API
  async initiateGitHubOAuth(): Promise<void> {
    window.location.href = `${this.baseURL}/web/auth/github`;
  }

  async getGitHubRepositories(): Promise<APIResponse<{ repositories: GitHubRepository[] }>> {
    return this.request('/web/repositories');
  }

  // Jobs API
  async getJobs(params?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<APIResponse<{ jobs: WebBackgroundJob[] }>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return this.request(`/web/jobs${query ? `?${query}` : ''}`);
  }

  async getJob(jobId: string): Promise<APIResponse<{ job: WebBackgroundJob }>> {
    return this.request(`/web/jobs/${jobId}`);
  }

  async createJob(jobRequest: CreateWebJobRequest): Promise<APIResponse<{ jobId: string }>> {
    return this.request('/web/jobs', {
      method: 'POST',
      body: JSON.stringify(jobRequest),
    });
  }

  async cancelJob(jobId: string): Promise<APIResponse<{ success: boolean }>> {
    return this.request(`/web/jobs/${jobId}`, {
      method: 'DELETE',
    });
  }

  async retryJob(jobId: string): Promise<APIResponse<{ success: boolean }>> {
    return this.request(`/web/jobs/${jobId}/retry`, {
      method: 'POST',
    });
  }

  // Snapshots API
  async getSnapshots(): Promise<APIResponse<{ snapshots: ProjectSnapshot[] }>> {
    return this.request('/web/snapshots');
  }

  async getSnapshot(snapshotId: string): Promise<APIResponse<{ snapshot: ProjectSnapshot }>> {
    return this.request(`/web/snapshots/${snapshotId}`);
  }

  async createSnapshot(snapshot: {
    name: string;
    repository: string;
    description?: string;
  }): Promise<APIResponse<{ snapshot: ProjectSnapshot }>> {
    return this.request('/web/snapshots', {
      method: 'POST',
      body: JSON.stringify(snapshot),
    });
  }

  async deleteSnapshot(snapshotId: string): Promise<APIResponse<{ success: boolean }>> {
    return this.request(`/web/snapshots/${snapshotId}`, {
      method: 'DELETE',
    });
  }

  // Background Agents API (direct)
  async getBackgroundJobs(params?: {
    limit?: number;
    offset?: number;
    status?: string;
    repo?: string;
  }): Promise<APIResponse<{ jobs: any[] }>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    if (params?.status) searchParams.set('status', params.status);
    if (params?.repo) searchParams.set('repo', params.repo);

    const query = searchParams.toString();
    return this.request(`/jobs${query ? `?${query}` : ''}`);
  }

  async getBackgroundJob(jobId: string): Promise<APIResponse<{ job: any }>> {
    return this.request(`/jobs/${jobId}`);
  }

  async createBackgroundJob(jobRequest: any): Promise<APIResponse<{ jobId: string; job: any }>> {
    return this.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(jobRequest),
    });
  }

  async cancelBackgroundJob(jobId: string): Promise<APIResponse<{ message: string }>> {
    return this.request(`/jobs/${jobId}`, {
      method: 'DELETE',
    });
  }

  async getStats(): Promise<APIResponse<{ jobs: any; queue: any }>> {
    return this.request('/stats');
  }

  async getQueueStats(): Promise<APIResponse<{ queue: any }>> {
    return this.request('/queue/stats');
  }

  async clearQueue(): Promise<APIResponse<{ message: string }>> {
    return this.request('/queue/clear', {
      method: 'POST',
    });
  }

  // Health check
  async healthCheck(): Promise<APIResponse<{ status: string; timestamp: string; version: string; uptime: number }>> {
    return this.request('/health');
  }
}

export const apiClient = new APIClient();