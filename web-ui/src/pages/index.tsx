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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
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
