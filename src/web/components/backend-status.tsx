'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { getBackendConfig, isBackendAvailable } from '../lib/backend-config';
import { apiClient } from '../lib/api-client';

interface BackendStatusProps {
  className?: string;
}

export function BackendStatus({ className = '' }: BackendStatusProps) {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected' | 'error'>('checking');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkBackendStatus = async () => {
    setStatus('checking');
    setError(null);

    try {
      if (!isBackendAvailable()) {
        setStatus('error');
        setError('Backend configuration not available');
        return;
      }

      const response = await apiClient.healthCheck();
      
      if (response.success) {
        setStatus('connected');
        setError(null);
      } else {
        setStatus('disconnected');
        setError(response.error || 'Backend not responding');
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLastCheck(new Date());
    }
  };

  useEffect(() => {
    checkBackendStatus();
    
    // Check every 30 seconds
    const interval = setInterval(checkBackendStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'disconnected':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'checking':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'Backend Connected';
      case 'disconnected':
        return 'Backend Disconnected';
      case 'error':
        return 'Backend Error';
      case 'checking':
        return 'Checking Backend...';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'text-green-600 dark:text-green-400';
      case 'disconnected':
        return 'text-red-600 dark:text-red-400';
      case 'error':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'checking':
        return 'text-blue-600 dark:text-blue-400';
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {getStatusIcon()}
      <span className={`text-sm font-medium ${getStatusColor()}`}>
        {getStatusText()}
      </span>
      {error && (
        <span className="text-xs text-muted-foreground" title={error}>
          ({error})
        </span>
      )}
      {lastCheck && (
        <span className="text-xs text-muted-foreground">
          {lastCheck.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}