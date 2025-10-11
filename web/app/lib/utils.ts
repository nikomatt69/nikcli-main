import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date)
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`
  return formatDate(d)
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'queued':
      return 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-300'
    case 'running':
      return 'text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-300'
    case 'succeeded':
      return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-300'
    case 'failed':
      return 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-300'
    case 'timeout':
      return 'text-orange-600 bg-orange-100 dark:bg-orange-900 dark:text-orange-300'
    case 'cancelled':
      return 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-300'
    default:
      return 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-300'
  }
}

export function getStatusIcon(status: string): string {
  switch (status) {
    case 'queued':
      return 'clock'
    case 'running':
      return 'loader-2'
    case 'succeeded':
      return 'check-circle'
    case 'failed':
      return 'x-circle'
    case 'timeout':
      return 'alert-triangle'
    case 'cancelled':
      return 'x'
    default:
      return 'help-circle'
  }
}