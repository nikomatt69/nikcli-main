'use client';

import React from 'react';
import { AlertCircle, Info } from 'lucide-react';

export function DemoBanner() {
  return (
    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
            Demo Interface
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            This is a demonstration interface for NikCLI Background Agents. 
            All data shown is mock data. To use real background agents, 
            you need to run the full NikCLI backend server.
          </p>
        </div>
      </div>
    </div>
  );
}

export function DemoAlert({ message }: { message: string }) {
  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}