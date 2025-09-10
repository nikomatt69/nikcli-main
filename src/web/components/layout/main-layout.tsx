'use client';

import { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { useWebSocket } from '../../lib/websocket-context';
import { clsx } from 'clsx';
import React from 'react';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { connected } = useWebSocket();

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Status Bar - Cursor style */}
        <div className="h-8 bg-card border-b border-border flex items-center justify-between px-4">
          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
            <span>Background Agents</span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={clsx(
                "h-1.5 w-1.5 rounded-full",
                connected ? "bg-green-500" : "bg-red-500"
              )} />
              <span className="text-xs text-muted-foreground">
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}