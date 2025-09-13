'use client'

import { clsx } from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { useWebSocket } from '../../lib/websocket-context'
import { Sidebar } from './sidebar'

interface MainLayoutProps {
  children: ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const { connected } = useWebSocket()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const checkIsDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }

    checkIsDesktop()
    window.addEventListener('resize', checkIsDesktop)

    return () => window.removeEventListener('resize', checkIsDesktop)
  }, [])

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && !isDesktop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={{
          x: isDesktop ? 0 : sidebarOpen ? 0 : '-100%',
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={clsx('fixed lg:relative lg:translate-x-0 z-50 lg:z-auto', 'w-72 lg:w-80 h-full')}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </motion.div>

      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
        {/* Enhanced Status Bar */}
        <motion.div
          className="h-14 lg:h-16 bg-card/50 backdrop-blur-sm border-b border-border/50 flex items-center justify-between section-padding"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center space-x-4">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-accent transition-colors"
            >
              <Menu className="h-5 w-5 text-foreground" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-medium text-foreground">Background Agents</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <motion.div
              className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-muted/50"
              whileHover={{ scale: 1.02 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <div
                className={clsx(
                  'h-2 w-2 rounded-full transition-colors duration-300',
                  connected
                    ? 'bg-emerald-500 shadow-emerald-500/50 shadow-sm'
                    : 'bg-red-500 shadow-red-500/50 shadow-sm'
                )}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </motion.div>
          </div>
        </motion.div>

        {/* Main Content with Enhanced Padding */}
        <main className="flex-1 overflow-auto bg-background/50">
          <div className="h-full page-padding">{children}</div>
        </main>
      </div>
    </div>
  )
}
