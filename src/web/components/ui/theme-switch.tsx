'use client';

import React from 'react';
import { useTheme } from '../../lib/theme-context';
import { Sun, Moon, Palette } from 'lucide-react';
import { clsx } from 'clsx';

interface ThemeSwitchProps {
  className?: string;
  showLabel?: boolean;
  variant?: 'button' | 'toggle';
}

export function ThemeSwitch({ 
  className,
  showLabel = true,
  variant = 'toggle'
}: ThemeSwitchProps) {
  const { theme, resolvedTheme, toggleTheme } = useTheme();

  if (variant === 'button') {
    return (
      <button
        onClick={toggleTheme}
        className={clsx(
          'flex items-center space-x-2 px-3 py-2 rounded-lg',
          'bg-surface hover:bg-surface-elevated',
          'border border-subtle hover:border-moderate',
          'transition-all duration-200 hover:shadow-md',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          className
        )}
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <div className="relative">
          {resolvedTheme === 'dark' ? (
            <Moon className="h-4 w-4 text-blue-400" />
          ) : (
            <Sun className="h-4 w-4 text-orange-500" />
          )}
          {theme === 'system' && (
            <Palette className="absolute -top-1 -right-1 h-2 w-2 text-gray-400" />
          )}
        </div>
        {showLabel && (
          <span className="text-sm font-medium text-contrast-high">
            {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={clsx('flex items-center space-x-3', className)}>
      {showLabel && (
        <div className="flex items-center space-x-2">
          <Sun className="h-4 w-4 text-orange-500" />
          <span className="text-sm text-contrast-medium">Light</span>
        </div>
      )}
      
      <button
        onClick={toggleTheme}
        className={clsx(
          'relative w-11 h-6 rounded-full p-0.5 transition-all duration-300',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          'shadow-inner',
          resolvedTheme === 'dark'
            ? 'bg-blue-600 shadow-blue-900/30'
            : 'bg-gray-200 shadow-gray-400/30'
        )}
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <div
          className={clsx(
            'flex items-center justify-center w-5 h-5 rounded-full',
            'bg-white shadow-lg transition-all duration-300 transform',
            'border border-gray-200',
            resolvedTheme === 'dark' 
              ? 'translate-x-5 shadow-lg' 
              : 'translate-x-0 shadow-md'
          )}
          style={{
            boxShadow: resolvedTheme === 'dark' 
              ? '0 4px 8px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)' 
              : '0 2px 4px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.05)'
          }}
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="h-3 w-3 text-blue-600" />
          ) : (
            <Sun className="h-3 w-3 text-orange-500" />
          )}
        </div>
        
        {theme === 'system' && (
          <div className="absolute -top-1 -right-1">
            <div className="w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center">
              <Palette className="h-2 w-2 text-white" />
            </div>
          </div>
        )}
      </button>

      {showLabel && (
        <div className="flex items-center space-x-2">
          <span className="text-sm text-contrast-medium">Dark</span>
          <Moon className="h-4 w-4 text-blue-500" />
        </div>
      )}
    </div>
  );
}