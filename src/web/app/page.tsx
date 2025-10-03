'use client'

import { MainLayout } from '../components/layout/main-layout'
import { ConfigProvider } from '../lib/config-context'
import { ThemeProvider } from '../lib/theme-context'
import { WebSocketProvider } from '../lib/websocket-context'
import { DashboardPage } from '../pages/dashboard'

export default function HomePage() {
  return (
    <ThemeProvider>
      <ConfigProvider>
        <WebSocketProvider>
          <MainLayout>
            <DashboardPage />
          </MainLayout>
        </WebSocketProvider>
      </ConfigProvider>
    </ThemeProvider>
  )
}
