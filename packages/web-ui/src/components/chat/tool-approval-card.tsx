/**
 * ToolApprovalCard Component
 * Card for approving/rejecting tool calls
 */

import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckIcon, XIcon, AlertTriangleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PendingToolApproval } from '@/types/chat'

export interface ToolApprovalCardProps {
  approval: PendingToolApproval
  onApprove: (approved: boolean) => void
  isProcessing?: boolean
}

export function ToolApprovalCard({
  approval,
  onApprove,
  isProcessing,
}: ToolApprovalCardProps) {
  const { toolCall } = approval
  const riskLevel = toolCall.riskLevel || 'medium'

  const riskColors = {
    low: 'text-green-500 bg-green-500/10 border-green-500/20',
    medium: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    high: 'text-red-500 bg-red-500/10 border-red-500/20',
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, x: -20 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ scale: 1.02 }}
    >
      <Card className={cn('border-2 holo-glow', riskColors[riskLevel])}>
        <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-xs font-mono">
                  {toolCall.name}
                </Badge>
                <Badge
                  variant={
                    riskLevel === 'high'
                      ? 'destructive'
                      : riskLevel === 'medium'
                      ? 'default'
                      : 'secondary'
                  }
                  className="text-xs"
                  pulse={riskLevel === 'high'}
                >
                  {riskLevel.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Requires your approval before execution
              </p>
            </div>
            {riskLevel === 'high' && (
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                <AlertTriangleIcon className="h-5 w-5 text-red-500" />
              </motion.div>
            )}
          </div>

          {/* Arguments */}
          <motion.div
            className="space-y-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ delay: 0.1 }}
          >
            <p className="text-xs font-medium">Arguments:</p>
            <div className="bg-accent/50 rounded p-2 text-xs font-mono max-h-32 overflow-y-auto holo-border">
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          </motion.div>

          {/* Affected files */}
          {toolCall.affectedFiles && toolCall.affectedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium">Affected files:</p>
              <div className="space-y-1">
                {toolCall.affectedFiles.map((file, idx) => (
                  <div key={idx} className="text-xs font-mono text-muted-foreground">
                    • {file}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="default"
              className="flex-1"
              onClick={() => onApprove(true)}
              disabled={isProcessing}
            >
              <CheckIcon className="h-3 w-3 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => onApprove(false)}
              disabled={isProcessing}
            >
              <XIcon className="h-3 w-3 mr-1" />
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    </motion.div>
  )
}
