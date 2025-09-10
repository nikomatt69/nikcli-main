'use client';

import React from 'react';
import { useTheme } from '../../lib/theme-context';
import { Sun, Moon, Palette } from 'lucide-react';
import { clsx } from 'clsx';

interface ThemeSwitchProps {
  className?: string;
  showLabel?: boolean;
  variant?: 'button' | 'toggle' | 'compact';
  size?: 'sm' | 'default' | 'lg';
}

export function ThemeSwitch({
  className,
  showLabel = true,
  variant = 'toggle',
  size = 'default'
}: ThemeSwitchProps) {
  const { theme, resolvedTheme, toggleTheme } = useTheme();

  const sizes = {
    sm: {
      button: 'px-3 py-2 text-xs',
      toggle: 'w-9 h-5',
      thumb: 'w-4 h-4',
      icon: 'h-3 w-3'
    },
    default: {
      button: 'px-4 py-2 text-sm',
      toggle: 'w-11 h-6',
      thumb: 'w-5 h-5',
      icon: 'h-4 w-4'
    },
    lg: {
      button: 'px-6 py-3 text-base',
      toggle: 'w-14 h-7',
      thumb: 'w-6 h-6',
      icon: 'h-5 w-5'
    }
  };

  if (variant === 'button') {
    return (
      <button
        onClick={toggleTheme}
        className={clsx(
          'flex items-center space-x-3 rounded-xl font-semibold transition-all duration-200',
          'bg-background/50 backdrop-blur-sm border border-border/50',
          'hover:bg-accent/50 hover:scale-[1.02] active:scale-[0.98]',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'shadow-sm hover:shadow-md',
          sizes[size].button,
          className
        )}
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <div className="relative">
          {resolvedTheme === 'dark' ? (
            <Moon className={clsx("text-blue-400", sizes[size].icon)} />
          ) : (
            <Sun className={clsx("text-orange-500", sizes[size].icon)} />
          )}
          {theme === 'system' && (
            <Palette className="absolute -top-1 -right-1 h-2 w-2 text-muted-foreground" />
          )}
        </div>
        {showLabel && (
          <span className="text-foreground">
            {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
          </span>
        )}
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={toggleTheme}
        className={clsx(
          'relative rounded-full p-2 transition-all duration-200',
          'bg-background/50 backdrop-blur-sm border border-border/50',
          'hover:bg-accent/50 hover:scale-110 active:scale-95',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'shadow-sm hover:shadow-md',
          className
        )}
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {resolvedTheme === 'dark' ? (
          <Moon className={clsx("text-blue-400", sizes[size].icon)} />
        ) : (
          <Sun className={clsx("text-orange-500", sizes[size].icon)} />
        )}
        {theme === 'system' && (
          <div className="absolute -top-1 -right-1">
            <div className="w-2 h-2 bg-purple-500 rounded-full" />
          </div>
        )}
      </button>
    );
  }

  return (
    <div className={clsx('flex items-center space-x-4', className)}>
      {showLabel && (
        <div className="flex items-center space-x-2">
          <Sun className={clsx("text-orange-500", sizes[size].icon)} />
          <span className="text-sm text-muted-foreground">Light</span>
        </div>
      )}

      <button
        onClick={toggleTheme}
        className={clsx(
          'relative rounded-full p-0.5 transition-all duration-300',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'shadow-inner hover:shadow-lg',
          resolvedTheme === 'dark'
            ? 'bg-gradient-to-r from-blue-600 to-blue-700 shadow-blue-900/30'
            : 'bg-gradient-to-r from-gray-200 to-gray-300 shadow-gray-400/30',
          sizes[size].toggle
        )}
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <div
          className={clsx(
            'flex items-center justify-center rounded-full',
            'bg-white shadow-lg transition-all duration-300 transform',
            'border border-gray-200/50',
            resolvedTheme === 'dark'
              ? 'translate-x-5 shadow-lg'
              : 'translate-x-0 shadow-md',
            sizes[size].thumb
          )}
        >
          {resolvedTheme === 'dark' ? (
            <Moon className={clsx("text-blue-600", sizes[size].icon)} />
          ) : (
            <Sun className={clsx("text-orange-500", sizes[size].icon)} />
          )}
        </div>

        {theme === 'system' && (
          <div className="absolute -top-1 -right-1">
            <div className="w-3 h-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center shadow-md">
              <Palette className="h-2 w-2 text-white" />
            </div>
          </div>
        )}
      </button>

      {showLabel && (
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Dark</span>
          <Moon className={clsx("text-blue-500", sizes[size].icon)} />
        </div>
      )}
    </div>
  );
}