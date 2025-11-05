/**
 * FileChangesPanel Component
 * Display file changes with diff viewer
 */

import { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { FileIcon, FilePlusIcon, FileEditIcon, FileMinusIcon, GitPullRequestIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileChange } from '@/types/chat'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism'

export interface FileChangesPanelProps {
  fileChanges: FileChange[]
}

export function FileChangesPanel({ fileChanges }: FileChangesPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const selectedChange = fileChanges.find((f) => f.path === selectedFile)

  const getFileIcon = (type: FileChange['type']) => {
    switch (type) {
      case 'added':
        return <FilePlusIcon className="h-4 w-4 text-green-500" />
      case 'modified':
        return <FileEditIcon className="h-4 w-4 text-yellow-500" />
      case 'deleted':
        return <FileMinusIcon className="h-4 w-4 text-red-500" />
    }
  }

  const getTypeBadgeVariant = (type: FileChange['type']) => {
    switch (type) {
      case 'added':
        return 'default'
      case 'modified':
        return 'secondary'
      case 'deleted':
        return 'destructive'
    }
  }

  if (fileChanges.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <FileIcon className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No file changes yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            File Changes
            <Badge variant="secondary">{fileChanges.length}</Badge>
          </h3>
          {fileChanges.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <GitPullRequestIcon className="h-3 w-3 mr-1" />
              Create PR
            </Button>
          )}
        </div>
      </div>

      {/* File list */}
      <div className="border-b border-border">
        <ScrollArea className="h-48">
          <div className="p-2 space-y-1">
            {fileChanges.map((change) => (
              <button
                key={change.path}
                onClick={() => setSelectedFile(change.path)}
                className={cn(
                  'w-full flex items-center gap-2 p-2 rounded text-left text-sm hover:bg-accent transition-colors',
                  selectedFile === change.path && 'bg-accent border border-primary'
                )}
              >
                {getFileIcon(change.type)}
                <span className="flex-1 truncate font-mono text-xs">{change.path}</span>
                <Badge variant={getTypeBadgeVariant(change.type)} className="text-xs">
                  {change.type[0].toUpperCase()}
                </Badge>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Diff viewer */}
      <ScrollArea className="flex-1">
        {selectedChange ? (
          <div className="p-4">
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                {getFileIcon(selectedChange.type)}
                <span className="text-sm font-mono font-semibold">
                  {selectedChange.path}
                </span>
                <Badge variant={getTypeBadgeVariant(selectedChange.type)}>
                  {selectedChange.type}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(selectedChange.timestamp).toLocaleString()}
              </p>
            </div>

            <Separator className="mb-3" />

            {/* Diff display */}
            <div className="text-xs">
              <SyntaxHighlighter
                language="diff"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                }}
              >
                {selectedChange.diff}
              </SyntaxHighlighter>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Select a file to view changes
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
