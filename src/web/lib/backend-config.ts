// Backend configuration for NikCLI Web Interface
export interface BackendConfig {
  apiUrl: string;
  wsUrl: string;
  githubClientId?: string;
  isProduction: boolean;
}

export function getBackendConfig(): BackendConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
    wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000/ws',
    githubClientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
    isProduction,
  };
}

export function getApiUrl(): string {
  return getBackendConfig().apiUrl;
}

export function getWsUrl(): string {
  return getBackendConfig().wsUrl;
}

export function isBackendAvailable(): boolean {
  const config = getBackendConfig();
  return !!(config.apiUrl && config.wsUrl);
}