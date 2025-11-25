'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, FileCode, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import hljs from 'highlight.js'

interface DiffViewerProps {
  filePath: string
  oldContent: string
  newContent: string
  onClose: () => void
}

interface DiffLine {
  type: 'add' | 'remove' | 'unchanged'
  oldLineNum?: number
  newLineNum?: number
  content: string
}

export function DiffViewer({ filePath, oldContent, newContent, onClose }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified')
  const [swipePosition, setSwipePosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const diffLines = computeDiff(oldContent, newContent)
  const language = detectLanguage(filePath)

  // Handle swipe for split view
  const handleTouchStart = () => {
    if (viewMode === 'split') {
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !containerRef.current) return

    const touch = e.touches[0]
    const rect = containerRef.current.getBoundingClientRect()
    const position = ((touch.clientX - rect.left) / rect.width) * 100
    setSwipePosition(Math.max(10, Math.min(90, position)))
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  const stats = {
    additions: diffLines.filter((l) => l.type === 'add').length,
    deletions: diffLines.filter((l) => l.type === 'remove').length,
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3 safe-top">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold truncate">{filePath}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-500">+{stats.additions}</span>
          <span className="text-red-500">-{stats.deletions}</span>
          <span className="text-muted-foreground">{language}</span>
        </div>

        {/* View Mode Toggle */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setViewMode('unified')}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              viewMode === 'unified'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            )}
          >
            Unified
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              viewMode === 'split'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            )}
          >
            Split
          </button>
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'unified' ? (
          <UnifiedDiffView diffLines={diffLines} language={language} />
        ) : (
          <SplitDiffView
            oldContent={oldContent}
            newContent={newContent}
            language={language}
            swipePosition={swipePosition}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            containerRef={containerRef}
          />
        )}
      </div>
    </div>
  )
}

function UnifiedDiffView({ diffLines, language }: { diffLines: DiffLine[]; language: string }) {
  return (
    <div className="h-full overflow-auto scrollbar-thin font-mono text-sm">
      <table className="w-full border-collapse">
        <tbody>
          {diffLines.map((line, idx) => (
            <tr
              key={idx}
              className={cn(
                line.type === 'add' && 'bg-green-500/10',
                line.type === 'remove' && 'bg-red-500/10'
              )}
            >
              {/* Old Line Number */}
              <td
                className={cn(
                  'w-12 px-2 py-0.5 text-right text-muted-foreground',
                  'border-r border-border select-none'
                )}
              >
                {line.oldLineNum}
              </td>

              {/* New Line Number */}
              <td
                className={cn(
                  'w-12 px-2 py-0.5 text-right text-muted-foreground',
                  'border-r border-border select-none'
                )}
              >
                {line.newLineNum}
              </td>

              {/* Content */}
              <td className="px-2 py-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'shrink-0',
                      line.type === 'add' && 'text-green-500',
                      line.type === 'remove' && 'text-red-500',
                      line.type === 'unchanged' && 'text-muted-foreground'
                    )}
                  >
                    {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                  </span>
                  <code
                    className="whitespace-pre"
                    dangerouslySetInnerHTML={{
                      __html: highlightCode(line.content, language),
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface SplitDiffViewProps {
  oldContent: string
  newContent: string
  language: string
  swipePosition: number
  onTouchStart: () => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  containerRef: React.RefObject<HTMLDivElement>
}

function SplitDiffView({
  oldContent,
  newContent,
  language,
  swipePosition,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  containerRef,
}: SplitDiffViewProps) {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Old Content (Before) */}
      <div
        className="absolute inset-y-0 left-0 overflow-auto scrollbar-thin"
        style={{ width: `${swipePosition}%` }}
      >
        <div className="h-full border-r-2 border-red-500 bg-red-500/5">
          <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-2">
            <span className="text-sm font-medium text-red-500">Before</span>
          </div>
          <div className="font-mono text-sm">
            <table className="w-full border-collapse">
              <tbody>
                {oldLines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="w-12 px-2 py-0.5 text-right text-muted-foreground border-r border-border select-none">
                      {idx + 1}
                    </td>
                    <td className="px-2 py-0.5">
                      <code
                        className="whitespace-pre"
                        dangerouslySetInnerHTML={{
                          __html: highlightCode(line, language),
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Content (After) */}
      <div
        className="absolute inset-y-0 right-0 overflow-auto scrollbar-thin"
        style={{ width: `${100 - swipePosition}%` }}
      >
        <div className="h-full border-l-2 border-green-500 bg-green-500/5">
          <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-2">
            <span className="text-sm font-medium text-green-500">After</span>
          </div>
          <div className="font-mono text-sm">
            <table className="w-full border-collapse">
              <tbody>
                {newLines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="w-12 px-2 py-0.5 text-right text-muted-foreground border-r border-border select-none">
                      {idx + 1}
                    </td>
                    <td className="px-2 py-0.5">
                      <code
                        className="whitespace-pre"
                        dangerouslySetInnerHTML={{
                          __html: highlightCode(line, language),
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Swipe Handle */}
      <div
        className="absolute top-0 bottom-0 z-20 flex items-center justify-center"
        style={{ left: `${swipePosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="flex h-12 w-8 items-center justify-center rounded-full bg-primary shadow-lg">
          <ChevronLeft className="h-4 w-4 text-primary-foreground" />
          <ChevronRight className="h-4 w-4 text-primary-foreground -ml-2" />
        </div>
      </div>
    </div>
  )
}

function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const diffLines: DiffLine[] = []

  let oldIdx = 0
  let newIdx = 0

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldLines[oldIdx]
    const newLine = newLines[newIdx]

    if (oldLine === newLine) {
      diffLines.push({
        type: 'unchanged',
        oldLineNum: oldIdx + 1,
        newLineNum: newIdx + 1,
        content: oldLine,
      })
      oldIdx++
      newIdx++
    } else if (newIdx >= newLines.length) {
      diffLines.push({
        type: 'remove',
        oldLineNum: oldIdx + 1,
        content: oldLine,
      })
      oldIdx++
    } else if (oldIdx >= oldLines.length) {
      diffLines.push({
        type: 'add',
        newLineNum: newIdx + 1,
        content: newLine,
      })
      newIdx++
    } else {
      const nextOldMatch = newLines.slice(newIdx).findIndex((l) => l === oldLine)
      const nextNewMatch = oldLines.slice(oldIdx).findIndex((l) => l === newLine)

      if (nextOldMatch !== -1 && (nextNewMatch === -1 || nextOldMatch < nextNewMatch)) {
        for (let i = 0; i < nextOldMatch; i++) {
          diffLines.push({
            type: 'add',
            newLineNum: newIdx + 1,
            content: newLines[newIdx],
          })
          newIdx++
        }
      } else if (nextNewMatch !== -1) {
        for (let i = 0; i < nextNewMatch; i++) {
          diffLines.push({
            type: 'remove',
            oldLineNum: oldIdx + 1,
            content: oldLines[oldIdx],
          })
          oldIdx++
        }
      } else {
        diffLines.push({
          type: 'remove',
          oldLineNum: oldIdx + 1,
          content: oldLine,
        })
        diffLines.push({
          type: 'add',
          newLineNum: newIdx + 1,
          content: newLine,
        })
        oldIdx++
        newIdx++
      }
    }
  }

  return diffLines
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
    swift: 'swift',
    kt: 'kotlin',
    md: 'markdown',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sql: 'sql',
    sh: 'bash',
  }
  return langMap[ext || ''] || 'plaintext'
}

function highlightCode(code: string, language: string): string {
  try {
    if (language === 'plaintext') return code
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return code
  }
}
