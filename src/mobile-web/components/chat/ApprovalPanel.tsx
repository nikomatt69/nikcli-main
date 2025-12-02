'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, FileCode, Terminal, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/lib/store'
import { apiClient, type ApprovalRequest } from '@/lib/api-client'
import { DiffViewer } from './DiffViewer'

export function ApprovalPanel() {
  const { isApprovalPanelOpen, pendingApprovals, removeApproval } = useStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [viewingDiff, setViewingDiff] = useState<{
    filePath: string
    oldContent: string
    newContent: string
  } | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const handleApprove = async (approval: ApprovalRequest) => {
    setProcessingId(approval.id)
    try {
      await apiClient.respondToApproval(approval.id, true)
      removeApproval(approval.id)
    } catch (error) {
      console.error('Failed to approve:', error)
      alert('Failed to approve. Please try again.')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (approval: ApprovalRequest, reason?: string) => {
    setProcessingId(approval.id)
    try {
      await apiClient.respondToApproval(approval.id, false, reason)
      removeApproval(approval.id)
    } catch (error) {
      console.error('Failed to reject:', error)
      alert('Failed to reject. Please try again.')
    } finally {
      setProcessingId(null)
    }
  }

  const handleViewDiff = (file: { path: string; changes: string; diff?: string }) => {
    const [oldContent, newContent] = parseDiff(file.diff || file.changes)
    setViewingDiff({
      filePath: file.path,
      oldContent,
      newContent,
    })
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  if (!isApprovalPanelOpen || pendingApprovals.length === 0) return null

  if (viewingDiff) {
    return (
      <DiffViewer
        filePath={viewingDiff.filePath}
        oldContent={viewingDiff.oldContent}
        newContent={viewingDiff.newContent}
        onClose={() => setViewingDiff(null)}
      />
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] animate-slide-up safe-bottom">
      <div className="rounded-t-3xl border-t border-border bg-card shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="h-1.5 w-12 rounded-full bg-muted" />
        </div>

        {/* Header */}
        <div className="border-b border-border px-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <h2 className="text-lg font-semibold">Pending Approvals</h2>
            </div>
            <div className="rounded-full bg-orange-500/20 px-3 py-1">
              <span className="text-sm font-medium text-orange-500">
                {pendingApprovals.length}
              </span>
            </div>
          </div>
        </div>

        {/* Approvals List */}
        <div className="max-h-[calc(85vh-120px)] overflow-y-auto scrollbar-thin">
          <div className="space-y-2 p-4">
            {pendingApprovals.map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                isExpanded={expandedId === approval.id}
                isProcessing={processingId === approval.id}
                onToggleExpand={() => toggleExpand(approval.id)}
                onApprove={() => handleApprove(approval)}
                onReject={(reason) => handleReject(approval, reason)}
                onViewDiff={handleViewDiff}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface ApprovalCardProps {
  approval: ApprovalRequest
  isExpanded: boolean
  isProcessing: boolean
  onToggleExpand: () => void
  onApprove: () => void
  onReject: (reason?: string) => void
  onViewDiff: (file: { path: string; changes: string; diff?: string }) => void
}

function ApprovalCard({
  approval,
  isExpanded,
  isProcessing,
  onToggleExpand,
  onApprove,
  onReject,
  onViewDiff,
}: ApprovalCardProps) {
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)

  const getIcon = () => {
    switch (approval.type) {
      case 'file_change':
        return <FileCode className="h-4 w-4" />
      case 'command_execution':
        return <Terminal className="h-4 w-4" />
      case 'agent_action':
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <AlertTriangle className="h-4 w-4" />
    }
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high':
        return 'text-red-500'
      case 'medium':
        return 'text-orange-500'
      case 'low':
        return 'text-yellow-500'
      default:
        return 'text-muted-foreground'
    }
  }

  const handleRejectClick = () => {
    if (showRejectInput && rejectReason.trim()) {
      onReject(rejectReason)
      setRejectReason('')
      setShowRejectInput(false)
    } else {
      setShowRejectInput(true)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-background transition-all',
        approval.details.risk === 'high' && 'border-red-500/50',
        approval.details.risk === 'medium' && 'border-orange-500/50'
      )}
    >
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="flex w-full items-start gap-3 p-4 text-left"
        disabled={isProcessing}
      >
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            'bg-secondary'
          )}
        >
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium truncate">{approval.title}</h3>
            {approval.details.risk && (
              <span
                className={cn(
                  'text-xs font-medium uppercase',
                  getRiskColor(approval.details.risk)
                )}
              >
                {approval.details.risk}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {approval.description}
          </p>
        </div>

        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border px-4 pb-4">
          {/* Details */}
          <div className="mb-4 mt-3 space-y-3">
            {/* Command */}
            {approval.details.command && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Command
                </p>
                <code className="block rounded bg-muted px-3 py-2 text-sm font-mono">
                  {approval.details.command}
                </code>
              </div>
            )}

            {/* Files */}
            {approval.details.files && approval.details.files.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Files ({approval.details.files.length})
                </p>
                <div className="space-y-2">
                  {approval.details.files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded bg-muted px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.path}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.changes}
                        </p>
                      </div>
                      {file.diff && (
                        <button
                          onClick={() => onViewDiff(file)}
                          className="ml-2 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-accent"
                        >
                          View
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Reject Reason Input */}
          {showRejectInput && (
            <div className="mb-3">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Rejection Reason (optional)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why are you rejecting this?"
                className={cn(
                  'w-full rounded-lg border border-input bg-background px-3 py-2',
                  'text-sm placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  'resize-none'
                )}
                rows={3}
                disabled={isProcessing}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onApprove}
              disabled={isProcessing}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3',
                'bg-green-500 text-white font-medium',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'hover:bg-green-600 active:bg-green-700 transition-colors'
              )}
            >
              <CheckCircle className="h-5 w-5" />
              {isProcessing ? 'Processing...' : 'Approve'}
            </button>

            <button
              onClick={handleRejectClick}
              disabled={isProcessing}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3',
                'bg-red-500 text-white font-medium',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'hover:bg-red-600 active:bg-red-700 transition-colors'
              )}
            >
              <XCircle className="h-5 w-5" />
              {showRejectInput && rejectReason.trim() ? 'Confirm Reject' : 'Reject'}
            </button>
          </div>

          {showRejectInput && !rejectReason.trim() && (
            <button
              onClick={() => {
                setShowRejectInput(false)
                setRejectReason('')
              }}
              className="w-full mt-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function parseDiff(diff: string): [string, string] {
  const lines = diff.split('\n')
  const oldContent: string[] = []
  const newContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('-') && !line.startsWith('---')) {
      oldContent.push(line.substring(1))
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      newContent.push(line.substring(1))
    } else if (!line.startsWith('@@') && !line.startsWith('---') && !line.startsWith('+++')) {
      oldContent.push(line)
      newContent.push(line)
    }
  }

  return [oldContent.join('\n'), newContent.join('\n')]
}
