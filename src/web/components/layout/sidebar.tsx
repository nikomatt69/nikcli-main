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
  Users
} from 'lucide-react';
import { ThemeSwitch } from '../ui/theme-switch';
import React from 'react';

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Background Agents', href: '/jobs', icon: Briefcase },
  { name: 'Snapshots', href: '/snapshots', icon: Camera },
  { name: 'Integrations', href: '/config', icon: Settings },
];

const integrations = [
  { name: 'GitHub', href: '/config?tab=github', icon: Github },
  { name: 'Slack', href: '/config?tab=slack', icon: Bell },
  { name: 'Linear', href: '/config?tab=linear', icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-card border-r border-border">
      {/* Header */}
      <div className="flex h-14 items-center px-4 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-medium text-foreground">Background Agents</h1>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={clsx(
                    'flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors',
                    isActive 
                      ? 'bg-accent text-accent-foreground' 
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Integrations */}
        <div className="mt-8">
          <h3 className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Integrations
          </h3>
          <ul className="space-y-1">
            {integrations.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={clsx(
                      'flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors',
                      isActive 
                        ? 'bg-accent text-accent-foreground' 
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.name}</span>
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <span className="text-xs font-medium">NM</span>
            </div>
            <div className="text-sm font-medium text-foreground">Nicola Mattioli</div>
          </div>
          <ThemeSwitch showLabel={false} variant="toggle" />
        </div>
      </div>
    </div>
  );
}