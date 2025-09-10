'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Settings,
  Briefcase,
  Camera,
  Github,
  Activity,
  Bell,
  Users,
  X,
  Zap
} from 'lucide-react';
import { ThemeSwitch } from '../ui/theme-switch';
import { motion, AnimatePresence } from 'framer-motion';
import React from 'react';

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard, description: 'Dashboard & analytics' },
  { name: 'Background Agents', href: '/jobs', icon: Briefcase, description: 'Manage agents' },
  { name: 'Snapshots', href: '/snapshots', icon: Camera, description: 'Project snapshots' },
  { name: 'Integrations', href: '/config', icon: Settings, description: 'Settings & config' },
];

const integrations = [
  { name: 'GitHub', href: '/config?tab=github', icon: Github, status: 'connected' },
  { name: 'Slack', href: '/config?tab=slack', icon: Bell, status: 'disconnected' },
  { name: 'Linear', href: '/config?tab=linear', icon: Activity, status: 'disconnected' },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-full flex-col bg-card/95 backdrop-blur-xl border-r border-border/50">
      {/* Enhanced Header */}
      <motion.div
        className="flex h-16 lg:h-20 items-center justify-between px-6 border-b border-border/50"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center space-x-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Background Agents</h1>
            <p className="text-xs text-muted-foreground">Enterprise AI Platform</p>
          </div>
        </div>

        {/* Mobile Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        )}
      </motion.div>

      {/* Enhanced Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        <div className="space-y-1">
          {navigation.map((item, index) => {
            const isActive = pathname === item.href;
            return (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <Link
                  href={item.href}
                  className={clsx(
                    'group flex items-center space-x-4 px-4 py-3 rounded-xl text-sm transition-all duration-200',
                    'hover:scale-[1.02] active:scale-[0.98]',
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={onClose}
                >
                  <div
                    className={clsx(
                      'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                      isActive ? 'bg-primary text-primary-foreground' : 'bg-muted group-hover:bg-accent'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                  </div>
                  {isActive && (
                    <motion.div
                      className="h-2 w-2 rounded-full bg-primary"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Enhanced Integrations Section */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Integrations
          </h3>
          <div className="space-y-1">
            {integrations.map((item, index) => {
              const isActive = pathname.startsWith(item.href);
              const isConnected = item.status === 'connected';
              return (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
                >
                  <Link
                    href={item.href}
                    className={clsx(
                      'group flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200',
                      'hover:scale-[1.02] active:scale-[0.98]',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                    onClick={onClose}
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted group-hover:bg-accent transition-colors">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <span className="flex-1 font-medium">{item.name}</span>
                    <div className={clsx(
                      'h-2 w-2 rounded-full transition-colors',
                      isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                    )} />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </nav>

      {/* Enhanced Footer */}
      <motion.div
        className="border-t border-border/50 p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.6 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
              <span className="text-sm font-semibold">NM</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Nicola Mattioli</div>
              <div className="text-xs text-muted-foreground">Enterprise User</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <ThemeSwitch showLabel={false} variant="toggle" />
        </div>
      </motion.div>
    </div>
  );
}