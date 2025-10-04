'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Clock, XCircle, Loader, AlertTriangle } from 'lucide-react'
import type { BackgroundJob } from '../hooks/useJobList'

interface JobFlowProps {
    job: BackgroundJob | null
}

export default function JobFlow({ job }: JobFlowProps) {
    const [currentStep, setCurrentStep] = useState(0)

    const steps = [
        { id: 'queued', label: 'Queued', icon: Clock },
        { id: 'running', label: 'Running', icon: Loader },
        { id: 'succeeded', label: 'Completed', icon: CheckCircle },
    ]

    useEffect(() => {
        if (!job) return

        const stepIndex = steps.findIndex((s) => s.id === job.status)
        if (stepIndex >= 0) {
            setCurrentStep(stepIndex)
        }
    }, [job?.status])

    if (!job) {
        return (
            <div className="h-full p-6 flex items-center justify-center text-gray-500 dark:text-gray-400">
                <div className="text-center">
                    <Loader className="w-12 h-12 mx-auto mb-4 opacity-50 animate-spin" />
                    <p>Select a job to view its flow</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full p-6 overflow-y-auto">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Job Flow</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {job.repo} • {job.task}
                </p>
            </div>

            {/* Vertical Flow Visualization */}
            <div className="space-y-4 mb-8">
                {steps.map((step, index) => {
                    const isActive = job.status === step.id
                    const isCompleted = index < currentStep
                    const isFailed = job.status === 'failed' && index === currentStep
                    const isTimeout = job.status === 'timeout' && index === currentStep
                    const Icon = step.icon

                    return (
                        <div key={step.id} className="flex items-start gap-4">
                            <div className="relative">
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isActive
                                            ? 'bg-blue-600 text-white'
                                            : isCompleted
                                                ? 'bg-green-600 text-white'
                                                : isFailed || isTimeout
                                                    ? 'bg-red-600 text-white'
                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                                        }`}
                                >
                                    {isFailed || isTimeout ? (
                                        <XCircle className="w-5 h-5" />
                                    ) : (
                                        <Icon className={`w-5 h-5 ${isActive ? 'animate-spin' : ''}`} />
                                    )}
                                </div>
                                {index < steps.length - 1 && (
                                    <div
                                        className={`absolute left-1/2 top-10 w-0.5 h-8 -translate-x-1/2 ${isCompleted ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'
                                            }`}
                                    />
                                )}
                            </div>
                            <div className="flex-1 pt-2">
                                <p className="font-medium text-gray-900 dark:text-white">{step.label}</p>
                                {isActive && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400">In progress...</p>
                                )}
                                {isCompleted && (
                                    <p className="text-sm text-green-600 dark:text-green-400">✓ Complete</p>
                                )}
                                {(isFailed || isTimeout) && (
                                    <p className="text-sm text-red-600 dark:text-red-400">
                                        {job.error || 'Failed'}
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Metrics */}
            {job.metrics && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Metrics</h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <p className="text-gray-600 dark:text-gray-400">Tool Calls</p>
                            <p className="font-medium text-gray-900 dark:text-white">{job.metrics.toolCalls}</p>
                        </div>
                        <div>
                            <p className="text-gray-600 dark:text-gray-400">Token Usage</p>
                            <p className="font-medium text-gray-900 dark:text-white">
                                {job.metrics.tokenUsage.toLocaleString()}
                            </p>
                        </div>
                        <div>
                            <p className="text-gray-600 dark:text-gray-400">Execution Time</p>
                            <p className="font-medium text-gray-900 dark:text-white">
                                {(job.metrics.executionTime / 1000).toFixed(2)}s
                            </p>
                        </div>
                        <div>
                            <p className="text-gray-600 dark:text-gray-400">Memory</p>
                            <p className="font-medium text-gray-900 dark:text-white">
                                {job.metrics.memoryUsage.toFixed(0)} MB
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Real-time Logs */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Live Logs</h3>
                <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs bg-gray-900 dark:bg-black p-4 rounded-lg">
                    {job.logs && job.logs.length > 0 ? (
                        job.logs.slice(-50).map((log: any, i: number) => (
                            <div
                                key={i}
                                className={`${log.level === 'error'
                                        ? 'text-red-400'
                                        : log.level === 'warn'
                                            ? 'text-yellow-400'
                                            : log.level === 'info'
                                                ? 'text-blue-400'
                                                : 'text-gray-400'
                                    }`}
                            >
                                [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                            </div>
                        ))
                    ) : (
                        <div className="text-gray-500">No logs yet...</div>
                    )}
                </div>
            </div>

            {/* Pull Request Link */}
            {job.prUrl && (
                <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm text-green-800 dark:text-green-200 mb-2">Pull Request Created</p>
                    <a
                        href={job.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-600 dark:text-green-400 hover:underline text-sm"
                    >
                        {job.prUrl}
                    </a>
                </div>
            )}
        </div>
    )
}

