'use client'

import { useState } from 'react'
import FloatingChat from './components/FloatingChat'
import JobDashboard from './components/JobDashboard'
import JobFlow from './components/JobFlow'
import NewAgentModal from './components/NewAgentModal'
import UpgradeModal from './components/UpgradeModal'
import AuthModal from './components/AuthModal'
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
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
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

          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
          >
            Sign In / Sign Up
          </button>

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
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading jobs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Left Panel - Job Dashboard */}
      <div className="w-96 border-r border-gray-200 dark:border-gray-700">
        <JobDashboard
          jobs={jobs}
          selectedJobId={selectedJobId}
          onSelectJob={setSelectedJobId}
          onCreateNew={() => setIsModalOpen(true)}
          userId={user?.id}
          onUpgradeClick={() => setIsUpgradeModalOpen(true)}
        />
      </div>

      {/* Center Panel - Main Content (Diff Viewer placeholder) */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
          {selectedJob ? (
            <div className="text-center max-w-2xl">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">{selectedJob.repo}</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{selectedJob.task}</p>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span
                      className={`font-semibold ${
                        selectedJob.status === 'succeeded'
                          ? 'text-green-600'
                          : selectedJob.status === 'running'
                            ? 'text-blue-600'
                            : selectedJob.status === 'failed'
                              ? 'text-red-600'
                              : 'text-gray-600'
                      }`}
                    >
                      {selectedJob.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Branch:</span>
                    <span className="font-mono text-sm">{selectedJob.workBranch}</span>
                  </div>

                  {selectedJob.prUrl && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <a
                        href={selectedJob.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        View Pull Request →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Select a Job</h3>
              <p className="text-gray-600 dark:text-gray-400">Choose a job from the left panel to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Job Flow */}
      <div className="w-96 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <JobFlow job={selectedJob} />
      </div>

      {/* Floating Chat */}
      {selectedJobId && <FloatingChat jobId={selectedJobId} />}

      {/* New Agent Modal */}
      <NewAgentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleCreateAgent} />

      {/* Upgrade Modal */}
      <UpgradeModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} userId={user?.id} />

      {/* User Menu (optional - for sign out) */}
      {user && (
        <div className="fixed top-4 right-4 z-40">
          <button
            onClick={signOut}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
