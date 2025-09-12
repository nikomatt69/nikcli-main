'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Activity,
  Settings,
  Camera,
  Github,
  Zap,
  BarChart3,
  HelpCircle,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useWebSocket } from '../../lib/websocket-context';
import { useWebConfig } from '../../lib/config-context';
import { ThemeSwitch } from '../ui/theme-switch';

interface SidebarProps {
  onClose?: () => void;
}

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Overview and statistics',
  },
  {
    name: 'Background Agents',
    href: '/jobs',
    icon: Activity,
    description: 'Manage and monitor agents',
  },
  {
    name: 'Snapshots',
    href: '/snapshots',
    icon: Camera,
    description: 'Project snapshots',
  },
  {
    name: 'Configuration',
    href: '/config',
    icon: Settings,
    description: 'Settings and integrations',
  },
];

const quickActions = [
  {
    name: 'New Agent',
    href: '/jobs?action=create',
    icon: Zap,
    description: 'Create a new background agent',
  },
  {
    name: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    description: 'Performance metrics',
  },
];

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { connected } = useWebSocket();
  const { config } = useWebConfig();

  const isConfigured = config?.github?.token && config?.defaultRepository;

  return (
    <div className="flex h-full flex-col bg-card/50 backdrop-blur-sm border-r border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border/50">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">NikCLI</h1>
            <p className="text-xs text-muted-foreground">Background Agents</p>
          </div>
        </div>
        <ThemeSwitch />
      </div>

      {/* Connection Status */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={clsx(
              "h-2 w-2 rounded-full transition-colors duration-300",
              connected ? "bg-emerald-500 shadow-emerald-500/50 shadow-sm" : "bg-red-500 shadow-red-500/50 shadow-sm"
            )} />
            <span className="text-sm font-medium text-foreground">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          {!isConfigured && (
            <div className="flex items-center space-x-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full">
              <Settings className="h-3 w-3" />
              <span>Setup Required</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Navigation
          </h3>
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={clsx(
                  'group flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]',
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <div className="flex items-center space-x-3">
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <div>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.description}
                    </div>
                  </div>
                </div>
                {isActive && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="h-2 w-2 rounded-full bg-primary"
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="space-y-1 pt-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Quick Actions
          </h3>
          {quickActions.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className="group flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="flex items-center space-x-3">
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.description}
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border/50 space-y-2">
        <Link
          href="/help"
          onClick={onClose}
          className="flex items-center space-x-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-200"
        >
          <HelpCircle className="h-4 w-4" />
          <span>Help & Support</span>
        </Link>
        
        <div className="flex items-center space-x-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground">
          <Github className="h-4 w-4" />
          <span>GitHub Integration</span>
          {config?.github?.token ? (
            <div className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
          ) : (
            <div className="ml-auto h-2 w-2 rounded-full bg-red-500" />
          )}
        </div>
      </div>
    </div>
  );
}