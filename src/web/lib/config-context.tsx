'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { WebConfig } from '../types';

interface WebConfigContextType {
  config: WebConfig | null;
  loading: boolean;
  error: string | null;
  updateConfig: (newConfig: Partial<WebConfig>) => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const WebConfigContext = createContext<WebConfigContextType | undefined>(undefined);

const DEFAULT_CONFIG: WebConfig = {
  github: {
    token: null,
    username: null,
    repositories: [],
  },
  defaultModel: 'claude-3-5-sonnet-latest',
  defaultRepository: null,
  notifications: {
    slack: false,
    email: false,
  },
};

export function WebConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<WebConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/v1/web/config');
      if (!response.ok) {
        throw new Error('Failed to fetch configuration');
      }
      
      const data = await response.json();
      setConfig(data.config || DEFAULT_CONFIG);
    } catch (err) {
      console.error('Error fetching config:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Use default config on error
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (newConfig: Partial<WebConfig>) => {
    try {
      const response = await fetch('/api/v1/web/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newConfig),
      });

      if (!response.ok) {
        throw new Error('Failed to update configuration');
      }

      const data = await response.json();
      setConfig(data.config);
    } catch (err) {
      console.error('Error updating config:', err);
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
      throw err;
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  return (
    <WebConfigContext.Provider
      value={{
        config,
        loading,
        error,
        updateConfig,
        refreshConfig: fetchConfig,
      }}
    >
      {children}
    </WebConfigContext.Provider>
  );
}

export function useWebConfig() {
  const context = useContext(WebConfigContext);
  if (context === undefined) {
    throw new Error('useWebConfig must be used within a WebConfigProvider');
  }
  return context;
}