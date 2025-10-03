'use client'

import { MainLayout } from '../../../components/layout/main-layout'
import { ConfigProvider } from '../../../lib/config-context'
import { ThemeProvider } from '../../../lib/theme-context'
import { WebSocketProvider } from '../../../lib/websocket-context'
import { JobCreatePage } from '../../../pages/job-create'

export default function NewJobPage() {
  return (
    <ThemeProvider>
      <ConfigProvider>
        <WebSocketProvider>
          <MainLayout>
            <JobCreatePage />
          </MainLayout>
        </WebSocketProvider>
      </ConfigProvider>
    </ThemeProvider>
  )
}
