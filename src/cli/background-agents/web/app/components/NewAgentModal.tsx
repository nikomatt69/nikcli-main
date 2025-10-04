'use client'

import { useState } from 'react'
import { X, Loader } from 'lucide-react'

interface NewAgentModalProps {
    isOpen: boolean
    onClose: () => void
    onSubmit: (data: any) => Promise<void>
}

export default function NewAgentModal({ isOpen, onClose, onSubmit }: NewAgentModalProps) {
    const [formData, setFormData] = useState({
        repo: '',
        baseBranch: 'main',
        task: '',
        playbook: '',
        limits: {
            timeMin: 30,
            maxToolCalls: 50,
            maxMemoryMB: 2048,
        },
    })
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        try {
            await onSubmit(formData)
            onClose()
            // Reset form
            setFormData({
                repo: '',
                baseBranch: 'main',
                task: '',
                playbook: '',
                limits: {
                    timeMin: 30,
                    maxToolCalls: 50,
                    maxMemoryMB: 2048,
                },
            })
        } catch (error) {
            console.error('Failed to create agent:', error)
        } finally {
            setSubmitting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
                {/* Modal Header */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Create New Background Agent
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        disabled={submitting}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    {/* Repository */}
                    <div className="mb-4">
                        <label className="block font-medium mb-2 text-gray-900 dark:text-white">
                            Repository
                        </label>
                        <input
                            type="text"
                            value={formData.repo}
                            onChange={(e) => setFormData({ ...formData, repo: e.target.value })}
                            placeholder="owner/repo"
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    {/* Branch */}
                    <div className="mb-4">
                        <label className="block font-medium mb-2 text-gray-900 dark:text-white">
                            Base Branch
                        </label>
                        <input
                            type="text"
                            value={formData.baseBranch}
                            onChange={(e) => setFormData({ ...formData, baseBranch: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>

                    {/* Task Description */}
                    <div className="mb-4">
                        <label className="block font-medium mb-2 text-gray-900 dark:text-white">
                            Task Description
                        </label>
                        <textarea
                            value={formData.task}
                            onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                            rows={4}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Describe the task for the agent..."
                            required
                        />
                    </div>

                    {/* Playbook (Optional) */}
                    <div className="mb-4">
                        <label className="block font-medium mb-2 text-gray-900 dark:text-white">
                            Playbook (Optional)
                        </label>
                        <input
                            type="text"
                            value={formData.playbook}
                            onChange={(e) => setFormData({ ...formData, playbook: e.target.value })}
                            placeholder="fix-tests, upgrade-deps, etc."
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Advanced Options */}
                    <details className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <summary className="cursor-pointer font-medium mb-2 text-gray-900 dark:text-white">
                            Advanced Options
                        </summary>
                        <div className="space-y-4 mt-4">
                            <div>
                                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">
                                    Time Limit (minutes)
                                </label>
                                <input
                                    type="number"
                                    value={formData.limits.timeMin}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            limits: { ...formData.limits, timeMin: parseInt(e.target.value) || 30 },
                                        })
                                    }
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    min={5}
                                    max={120}
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">
                                    Max Tool Calls
                                </label>
                                <input
                                    type="number"
                                    value={formData.limits.maxToolCalls}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            limits: { ...formData.limits, maxToolCalls: parseInt(e.target.value) || 50 },
                                        })
                                    }
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    min={10}
                                    max={200}
                                />
                            </div>
                            <div>
                                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">
                                    Max Memory (MB)
                                </label>
                                <input
                                    type="number"
                                    value={formData.limits.maxMemoryMB}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            limits: {
                                                ...formData.limits,
                                                maxMemoryMB: parseInt(e.target.value) || 2048,
                                            },
                                        })
                                    }
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    min={512}
                                    max={8192}
                                    step={512}
                                />
                            </div>
                        </div>
                    </details>

                    {/* Submit Buttons */}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                            disabled={submitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            disabled={submitting}
                        >
                            {submitting ? (
                                <>
                                    <Loader className="w-4 h-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Agent'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

