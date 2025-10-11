'use client'

import { cn } from '../lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  text?: string
}

export default function LoadingSpinner({ size = 'md', className, text }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-4', className)}>
      <div
        className={cn(
          'border-4 border-primary-600 border-t-transparent rounded-full animate-spin',
          sizeClasses[size]
        )}
      />
      {text && (
        <p className="text-gray-600 dark:text-gray-400 text-sm animate-pulse">{text}</p>
      )}
    </div>
  )
}