'use client'

import { MainLayout } from '../../components/layout/main-layout'
import { ConfigProvider } from '../../lib/config-context'
import { ThemeProvider } from '../../lib/theme-context'
import { WebSocketProvider } from '../../lib/websocket-context'
import { JobsListPage } from '../../pages/jobs-list'

export default function JobsPage() {
  return (
    <ThemeProvider>
      <ConfigProvider>
        <WebSocketProvider>
          <MainLayout>
            <JobsListPage />
          </MainLayout>
        </WebSocketProvider>
      </ConfigProvider>
    </ThemeProvider>
  )
}
