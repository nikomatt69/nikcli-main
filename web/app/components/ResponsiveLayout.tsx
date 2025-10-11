'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { cn } from '../lib/utils'

interface ResponsiveLayoutProps {
  leftPanel: React.ReactNode
  centerPanel: React.ReactNode
  rightPanel: React.ReactNode
  className?: string
}

export default function ResponsiveLayout({ leftPanel, centerPanel, rightPanel, className }: ResponsiveLayoutProps) {
  const [isLeftOpen, setIsLeftOpen] = useState(false)
  const [isRightOpen, setIsRightOpen] = useState(false)

  return (
    <div className={cn('h-screen flex overflow-hidden', className)}>
      {/* Mobile Menu Button - Left */}
      <button
        onClick={() => setIsLeftOpen(!isLeftOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile Menu Button - Right */}
      <button
        onClick={() => setIsRightOpen(!isRightOpen)}
        className="lg:hidden fixed top-4 right-20 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Left Panel */}
      <div
        className={cn(
          'w-96 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-transform duration-300 ease-in-out',
          'lg:translate-x-0 lg:static lg:z-auto',
          isLeftOpen ? 'translate-x-0' : '-translate-x-full',
          'fixed inset-y-0 left-0 z-40'
        )}
      >
        {/* Mobile Close Button */}
        <button
          onClick={() => setIsLeftOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="w-5 h-5" />
        </button>
        {leftPanel}
      </div>

      {/* Center Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {centerPanel}
      </div>

      {/* Right Panel */}
      <div
        className={cn(
          'w-96 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-transform duration-300 ease-in-out',
          'lg:translate-x-0 lg:static lg:z-auto',
          isRightOpen ? 'translate-x-0' : 'translate-x-full',
          'fixed inset-y-0 right-0 z-40'
        )}
      >
        {/* Mobile Close Button */}
        <button
          onClick={() => setIsRightOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="w-5 h-5" />
        </button>
        {rightPanel}
      </div>

      {/* Mobile Overlay */}
      {(isLeftOpen || isRightOpen) && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => {
            setIsLeftOpen(false)
            setIsRightOpen(false)
          }}
        />
      )}
    </div>
  )
}