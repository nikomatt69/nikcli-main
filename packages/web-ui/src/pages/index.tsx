import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuthStore } from '@/stores/auth-store'
import MainLayout from '@/components/layout/main-layout'
import JobsDashboard from '@/components/jobs/jobs-dashboard'

export default function HomePage() {
  const router = useRouter()
  const { user, isLoading } = useAuthStore()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
            <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full bg-primary/10" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Loading...</p>
            <p className="text-xs text-muted-foreground mt-1">Preparing your workspace</p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <MainLayout>
      <JobsDashboard />
    </MainLayout>
  )
}
