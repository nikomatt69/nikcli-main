'use client'

import { useParams } from 'next/navigation'
import { MainLayout } from '../../../components/layout/main-layout'
import { ConfigProvider } from '../../../lib/config-context'
import { ThemeProvider } from '../../../lib/theme-context'
import { WebSocketProvider } from '../../../lib/websocket-context'
import { JobDetailsPage } from '../../../pages/job-details'

export default function JobDetailPage() {
  const params = useParams()
  const jobId = params?.id as string

  return (
    <ThemeProvider>
      <ConfigProvider>
        <WebSocketProvider>
          <MainLayout>
            <JobDetailsPage jobId={jobId} />
          </MainLayout>
        </WebSocketProvider>
      </ConfigProvider>
    </ThemeProvider>
  )
}
