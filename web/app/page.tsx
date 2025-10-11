'use client'

import { useState } from 'react'
import FloatingChat from './components/FloatingChat'
import JobDashboard from './components/JobDashboard'
import JobFlow from './components/JobFlow'
import NewAgentModal from './components/NewAgentModal'
import UpgradeModal from './components/UpgradeModal'
import AuthModal from './components/AuthModal'
import ThemeToggle from './components/ThemeToggle'
import LoadingSpinner from './components/LoadingSpinner'
import Card from './components/Card'
import Button from './components/Button'
import ResponsiveLayout from './components/ResponsiveLayout'
import { useJobList } from './hooks/useJobList'
import { useAuth } from './contexts/AuthContext'

export default function Home() {
  const { user, loading: authLoading, signOut } = useAuth()
  const { jobs, loading } = useJobList()
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || null

  const handleCreateAgent = async (data: any) => {
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to create agent')
      }

      const result = await response.json()
      setSelectedJobId(result.jobId)
    } catch (error) {
      console.error('Failed to create agent:', error)
      alert('Failed to create agent. Please try again.')
    }
  }

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <LoadingSpinner size="lg" text="Loading application..." />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center max-w-md px-6">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">NikCLI Background Agents</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Sign in to manage your background agents and access Pro features
            </p>
          </div>

          <Button
            onClick={() => setIsAuthModalOpen(true)}
            size="lg"
            className="w-full"
          >
            Sign In / Sign Up
          </Button>

          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Use the same credentials as your NikCLI installation
          </p>

          <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <LoadingSpinner size="lg" text="Loading jobs..." />
      </div>
    )
  }

  const leftPanel = (
    <JobDashboard
      jobs={jobs}
      selectedJobId={selectedJobId}
      onSelectJob={setSelectedJobId}
      onCreateNew={() => setIsModalOpen(true)}
      userId={user?.id}
      onUpgradeClick={() => setIsUpgradeModalOpen(true)}
    />
  )

  const centerPanel = (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="flex-1 flex items-center justify-center p-8">
        {selectedJob ? (
          <Card className="max-w-2xl w-full" hover>
            <div className="text-center space-y-6">
              <div>
                <h2 className="text-3xl font-bold gradient-text mb-2">{selectedJob.repo}</h2>
                <p className="text-gray-600 dark:text-gray-400 text-lg">{selectedJob.task}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-400 font-medium">Status:</span>
                  <span
                    className={`font-semibold px-3 py-1 rounded-full text-sm ${
                      selectedJob.status === 'succeeded'
                        ? 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-300'
                        : selectedJob.status === 'running'
                          ? 'text-blue-600 bg-blue-100 dark:bg-blue-900 dark:text-blue-300'
                          : selectedJob.status === 'failed'
                            ? 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-300'
                            : 'text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {selectedJob.status.toUpperCase()}
                  </span>
                </div>

                <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-400 font-medium">Branch:</span>
                  <span className="font-mono text-sm bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                    {selectedJob.workBranch}
                  </span>
                </div>
              </div>

              {selectedJob.metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-2xl font-bold text-primary-600">{selectedJob.metrics.toolCalls}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Tool Calls</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-2xl font-bold text-primary-600">{selectedJob.metrics.tokenUsage}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Tokens</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-2xl font-bold text-primary-600">{Math.round(selectedJob.metrics.executionTime / 1000)}s</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Duration</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-2xl font-bold text-primary-600">{Math.round(selectedJob.metrics.memoryUsage / 1024 / 1024)}MB</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Memory</div>
                  </div>
                </div>
              )}

              {selectedJob.prUrl && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    onClick={() => window.open(selectedJob.prUrl, '_blank')}
                    className="w-full"
                    size="lg"
                  >
                    View Pull Request →
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card className="text-center max-w-md">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-purple-100 dark:from-primary-900 dark:to-purple-900 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Select a Job</h3>
            <p className="text-gray-600 dark:text-gray-400">Choose a job from the left panel to view details and monitor progress</p>
          </Card>
        )}
      </div>
    </div>
  )

  const rightPanel = <JobFlow job={selectedJob} />

  return (
    <>
      <ResponsiveLayout
        leftPanel={leftPanel}
        centerPanel={centerPanel}
        rightPanel={rightPanel}
      />

      {/* Floating Chat */}
      {selectedJobId && <FloatingChat jobId={selectedJobId} />}

      {/* New Agent Modal */}
      <NewAgentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleCreateAgent} />

      {/* Upgrade Modal */}
      <UpgradeModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} userId={user?.id} />

      {/* Top Right Controls */}
      {user && (
        <div className="fixed top-4 right-4 z-40 flex items-center gap-3">
          <ThemeToggle />
          <Button
            onClick={signOut}
            variant="ghost"
            size="sm"
          >
            Sign Out
          </Button>
        </div>
      )}
    </>
  )
}
