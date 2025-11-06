import { ReactNode, useState, useCallback } from 'react'
import Sidebar from './sidebar'
import Header from './header'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Memoize callbacks to prevent unnecessary re-renders
  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  const handleOpenSidebar = useCallback(() => {
    setSidebarOpen(true)
  }, [])

  const handleBackdropClick = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background p-0 sm:p-2 gap-0 sm:gap-2">
      {/* Desktop Sidebar */}
      <div className="relative flex-shrink-0 hidden lg:flex h-full">
        {/* Sidebar container */}
        <div className="relative h-full">
          <Sidebar onClose={handleCloseSidebar} />
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={handleBackdropClick}
          />

          {/* Mobile Sidebar */}
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <div className="relative h-full p-2">
              {/* Sidebar container */}
              <div className="relative h-full">
                <Sidebar onClose={handleCloseSidebar} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main content area */}
      <div className="flex flex-1 flex-col h-full overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border sm:border-border/50 bg-card/50 backdrop-blur-sm">
        <Header onMenuClick={handleOpenSidebar} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none rounded-none sm:rounded-2xl" />
          <div className="relative min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
