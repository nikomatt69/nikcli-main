'use client';

import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Settings } from 'lucide-react';
import { getBackendConfig } from '../lib/backend-config';

export function ConfigurationStatus() {
  const config = getBackendConfig();
  
  const isConfigured = !!(config.apiUrl && config.wsUrl);
  const isProduction = config.isProduction;
  
  if (!isProduction) {
    // In development, show a simple status
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-2 w-2 rounded-full bg-yellow-500" />
        <span>Development Mode</span>
      </div>
    );
  }
  
  if (isConfigured) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <CheckCircle className="h-4 w-4" />
        <span>Backend Configured</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
      <XCircle className="h-4 w-4" />
      <span>Backend Not Configured</span>
    </div>
  );
}

export function ConfigurationAlert() {
  const config = getBackendConfig();
  const isConfigured = !!(config.apiUrl && config.wsUrl);
  const isProduction = config.isProduction;
  
  // Only show alert in production when not configured
  if (!isProduction || isConfigured) {
    return null;
  }
  
  return (
    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-900 dark:text-red-100 mb-2">
            Backend Configuration Required
          </h3>
          <p className="text-sm text-red-700 dark:text-red-300 mb-3">
            This web interface requires a NikCLI backend server to function. 
            Please configure the required environment variables.
          </p>
          <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-3">
            <h4 className="text-sm font-medium text-red-900 dark:text-red-100 mb-2">
              Required Environment Variables:
            </h4>
            <div className="space-y-1 text-sm font-mono">
              <div className="text-red-800 dark:text-red-200">
                <span className="font-semibold">NEXT_PUBLIC_API_URL</span> = https://your-nikcli-backend.com/api/v1
              </div>
              <div className="text-red-800 dark:text-red-200">
                <span className="font-semibold">NEXT_PUBLIC_WS_URL</span> = wss://your-nikcli-backend.com/ws
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}