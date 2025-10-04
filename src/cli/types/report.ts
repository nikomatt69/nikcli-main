// Analysis and Report schema used for JSON/HTML export and VS Code webview
// Keep this small and stable. Backward-compatible additions only.

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export interface Evidence {
  file: string
  startLine?: number
  endLine?: number
  astNodeId?: string
  snippet?: string
  confidence?: number // 0..1
  sourcePass?: string // e.g., "planner", "validator", "agent:security"
}

export interface Finding {
  id: string
  title: string
  severity: Severity
  description?: string
  evidence?: Evidence[]
  affectedFiles?: string[]
}

export interface PatchHunk {
  header?: string
  oldStart?: number
  oldLines?: number
  newStart?: number
  newLines?: number
  lines: string[] // with +/- prefixes
}

export interface PatchEntry {
  filePath: string
  status: 'pending' | 'accepted' | 'rejected'
  hunks?: PatchHunk[]
  rationale?: string
  confidence?: number
}

export interface AnalysisStats {
  filesAnalyzed?: number
  durationMs?: number
  findingsCount?: number
  patchesCount?: number
}

export interface AnalysisConfigSnapshot {
  depth?: number
  model?: string
  timestamp: string
}

export interface AnalysisResult {
  id: string
  repoPath: string
  git?: {
    branch?: string
    commit?: string
    remote?: string
  }
  startedAt: string
  finishedAt: string
  config: AnalysisConfigSnapshot
  summary?: string
  findings: Finding[]
  patches: PatchEntry[]
  stats?: AnalysisStats
  session?: {
    messages?: Array<{
      role: 'user' | 'assistant' | 'system'
      content: string
      timestamp?: string
    }>
    liveUpdates?: Array<{
      type: string
      content: string
      timestamp?: string
      source?: string
    }>
  }
}
