'use client'

import { cn } from '../lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  padding?: 'sm' | 'md' | 'lg'
}

export default function Card({ children, className, hover = false, padding = 'md' }: CardProps) {
  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }

  return (
    <div
      className={cn(
        'card transition-all duration-200',
        paddingClasses[padding],
        hover && 'hover:shadow-medium hover:scale-[1.02]',
        className
      )}
    >
      {children}
    </div>
  )
}