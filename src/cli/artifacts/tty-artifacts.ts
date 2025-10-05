import { artifact } from '@ai-sdk-tools/artifacts'
import { z } from 'zod'
import chalk from 'chalk'

/**
 * TTY-Compatible Artifacts for Structured Streaming
 * 
 * Defines type-safe artifacts optimized for terminal rendering:
 * - Code diffs with syntax highlighting
 * - Analysis reports with progress tracking
 * - Tool execution logs with real-time updates
 * - RAG context with structured metadata
 * 
 * Opt-in via TTY_ARTIFACTS=true env variable
 */

// Code Diff Artifact
export const CodeDiffArtifact = artifact('code-diff', z.object({
  filePath: z.string(),
  language: z.string(),
  additions: z.number(),
  deletions: z.number(),
  chunks: z.array(z.object({
    oldStart: z.number(),
    oldLines: z.number(),
    newStart: z.number(),
    newLines: z.number(),
    lines: z.array(z.object({
      type: z.enum(['add', 'remove', 'context']),
      content: z.string(),
      lineNumber: z.number(),
    })),
  })),
  status: z.enum(['pending', 'applying', 'applied', 'error']),
  error: z.string().optional(),
}))

// Analysis Report Artifact
export const AnalysisReportArtifact = artifact('analysis-report', z.object({
  title: z.string(),
  summary: z.string(),
  findings: z.array(z.object({
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    category: z.string(),
    message: z.string(),
    location: z.object({
      file: z.string(),
      line: z.number().optional(),
      column: z.number().optional(),
    }).optional(),
    suggestion: z.string().optional(),
  })),
  metrics: z.object({
    filesAnalyzed: z.number(),
    issuesFound: z.number(),
    timeElapsed: z.number(),
    coverage: z.number().optional(),
  }),
  status: z.enum(['analyzing', 'complete', 'error']),
  progress: z.number().min(0).max(100),
}))

// Tool Execution Log Artifact
export const ToolExecutionLogArtifact = artifact('tool-execution-log', z.object({
  toolName: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  status: z.enum(['running', 'success', 'error', 'timeout']),
  input: z.record(z.any()),
  output: z.any().optional(),
  error: z.string().optional(),
  steps: z.array(z.object({
    name: z.string(),
    status: z.enum(['pending', 'running', 'complete', 'error']),
    duration: z.number().optional(),
    message: z.string().optional(),
  })),
  metadata: z.object({
    model: z.string().optional(),
    tokens: z.number().optional(),
    cost: z.number().optional(),
  }).optional(),
}))

// RAG Context Artifact
export const RAGContextArtifact = artifact('rag-context', z.object({
  query: z.string(),
  sources: z.array(z.object({
    id: z.string(),
    filePath: z.string(),
    snippet: z.string(),
    score: z.number(),
    metadata: z.object({
      language: z.string().optional(),
      functions: z.array(z.string()).optional(),
      classes: z.array(z.string()).optional(),
    }).optional(),
  })),
  metrics: z.object({
    totalSources: z.number(),
    avgScore: z.number(),
    embeddingTime: z.number(),
    searchTime: z.number(),
    cacheHit: z.boolean(),
  }),
  status: z.enum(['searching', 'complete', 'error']),
}))

// Code Generation Artifact
export const CodeGenerationArtifact = artifact('code-generation', z.object({
  targetFile: z.string(),
  language: z.string(),
  code: z.string(),
  explanation: z.string(),
  dependencies: z.array(z.string()).optional(),
  tests: z.string().optional(),
  status: z.enum(['generating', 'complete', 'error']),
  progress: z.number().min(0).max(100),
}))

// Multi-step Plan Artifact
export const MultiStepPlanArtifact = artifact('multi-step-plan', z.object({
  title: z.string(),
  description: z.string(),
  steps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum(['pending', 'in-progress', 'completed', 'skipped', 'error']),
    dependencies: z.array(z.string()).optional(),
    estimatedDuration: z.number().optional(),
    actualDuration: z.number().optional(),
    result: z.string().optional(),
  })),
  overallStatus: z.enum(['planning', 'executing', 'complete', 'error']),
  progress: z.number().min(0).max(100),
}))

/**
 * Check if TTY artifacts are enabled (default: enabled)
 */
export const isTTYArtifactsEnabled = (): boolean => {
  return process.env.TTY_ARTIFACTS !== 'false' && process.env.ENABLE_ARTIFACTS !== 'false'
}

/**
 * Render artifact to TTY-compatible format
 */
export class TTYArtifactRenderer {
  private enabled: boolean

  constructor() {
    this.enabled = isTTYArtifactsEnabled()

    if (this.enabled) {
      console.log(chalk.green('✓ TTY artifacts enabled by default for structured streaming'))
    }
  }

  /**
   * Render code diff to terminal
   */
  renderCodeDiff(diff: z.infer<typeof CodeDiffArtifact>['data']): string {
    let output = chalk.bold(`\n📝 ${diff.filePath}\n`)
    output += chalk.gray('─'.repeat(50)) + '\n'
    output += chalk.green(`+${diff.additions}`) + ' ' + chalk.red(`-${diff.deletions}`) + '\n\n'

    for (const chunk of diff.chunks) {
      output += chalk.cyan(`@@ -${chunk.oldStart},${chunk.oldLines} +${chunk.newStart},${chunk.newLines} @@\n`)

      for (const line of chunk.lines) {
        if (line.type === 'add') {
          output += chalk.green(`+ ${line.content}\n`)
        } else if (line.type === 'remove') {
          output += chalk.red(`- ${line.content}\n`)
        } else {
          output += chalk.gray(`  ${line.content}\n`)
        }
      }
    }

    output += '\n' + chalk.gray(`Status: ${diff.status}`)
    if (diff.error) {
      output += '\n' + chalk.red(`Error: ${diff.error}`)
    }

    return output
  }

  /**
   * Render analysis report to terminal
   */
  renderAnalysisReport(report: z.infer<typeof AnalysisReportArtifact>['data']): string {
    let output = chalk.bold.blue(`\n📊 ${report.title}\n`)
    output += chalk.gray('─'.repeat(50)) + '\n'
    output += chalk.gray(report.summary) + '\n\n'

    // Progress bar
    const progressBar = this.createProgressBar(report.progress, 30)
    output += `Progress: ${progressBar} ${report.progress}%\n\n`

    // Findings
    if (report.findings.length > 0) {
      output += chalk.bold('Findings:\n')

      for (const finding of report.findings) {
        const icon = this.getSeverityIcon(finding.severity)
        const color = this.getSeverityColor(finding.severity)

        output += color(`${icon} [${finding.category}] ${finding.message}\n`)

        if (finding.location) {
          output += chalk.gray(`   → ${finding.location.file}`)
          if (finding.location.line) {
            output += chalk.gray(`:${finding.location.line}`)
          }
          output += '\n'
        }

        if (finding.suggestion) {
          output += chalk.cyan(`   💡 ${finding.suggestion}\n`)
        }

        output += '\n'
      }
    }

    // Metrics
    output += chalk.bold('\nMetrics:\n')
    output += chalk.gray(`Files Analyzed: ${report.metrics.filesAnalyzed}\n`)
    output += chalk.gray(`Issues Found: ${report.metrics.issuesFound}\n`)
    output += chalk.gray(`Time Elapsed: ${report.metrics.timeElapsed}ms\n`)
    if (report.metrics.coverage) {
      output += chalk.gray(`Coverage: ${report.metrics.coverage}%\n`)
    }

    return output
  }

  /**
   * Render tool execution log to terminal
   */
  renderToolExecutionLog(log: z.infer<typeof ToolExecutionLogArtifact>['data']): string {
    let output = chalk.bold.cyan(`\n🔧 ${log.toolName}\n`)
    output += chalk.gray('─'.repeat(50)) + '\n'

    // Status
    const statusIcon = log.status === 'success' ? '✓' : log.status === 'error' ? '✗' : '⟳'
    const statusColor = log.status === 'success' ? chalk.green : log.status === 'error' ? chalk.red : chalk.yellow
    output += statusColor(`${statusIcon} Status: ${log.status}\n`)

    // Timing
    output += chalk.gray(`Started: ${new Date(log.startTime).toLocaleTimeString()}\n`)
    if (log.endTime) {
      const duration = new Date(log.endTime).getTime() - new Date(log.startTime).getTime()
      output += chalk.gray(`Duration: ${duration}ms\n`)
    }

    output += '\n'

    // Steps
    if (log.steps.length > 0) {
      output += chalk.bold('Steps:\n')

      for (const step of log.steps) {
        const stepIcon = step.status === 'complete' ? '✓' : step.status === 'error' ? '✗' : step.status === 'running' ? '⟳' : '○'
        const stepColor = step.status === 'complete' ? chalk.green : step.status === 'error' ? chalk.red : chalk.gray

        output += stepColor(`  ${stepIcon} ${step.name}`)

        if (step.duration) {
          output += chalk.gray(` (${step.duration}ms)`)
        }

        output += '\n'

        if (step.message) {
          output += chalk.gray(`     ${step.message}\n`)
        }
      }

      output += '\n'
    }

    // Metadata
    if (log.metadata) {
      output += chalk.bold('Metadata:\n')
      if (log.metadata.model) output += chalk.gray(`  Model: ${log.metadata.model}\n`)
      if (log.metadata.tokens) output += chalk.gray(`  Tokens: ${log.metadata.tokens}\n`)
      if (log.metadata.cost) output += chalk.gray(`  Cost: $${log.metadata.cost.toFixed(4)}\n`)
    }

    // Error
    if (log.error) {
      output += '\n' + chalk.red.bold('Error:\n')
      output += chalk.red(`  ${log.error}\n`)
    }

    return output
  }

  /**
   * Render RAG context to terminal
   */
  renderRAGContext(context: z.infer<typeof RAGContextArtifact>['data']): string {
    let output = chalk.bold.magenta(`\n🔍 RAG Context: "${context.query}"\n`)
    output += chalk.gray('─'.repeat(50)) + '\n'

    // Sources
    output += chalk.bold(`Found ${context.sources.length} relevant sources:\n\n`)

    for (let i = 0; i < Math.min(context.sources.length, 5); i++) {
      const source = context.sources[i]
      output += chalk.cyan(`${i + 1}. ${source.filePath}`) + chalk.gray(` (score: ${(source.score * 100).toFixed(1)}%)\n`)
      output += chalk.gray(`   ${source.snippet.substring(0, 100)}...\n\n`)
    }

    if (context.sources.length > 5) {
      output += chalk.gray(`   ...and ${context.sources.length - 5} more sources\n\n`)
    }

    // Metrics
    output += chalk.bold('Metrics:\n')
    output += chalk.gray(`  Avg Score: ${(context.metrics.avgScore * 100).toFixed(1)}%\n`)
    output += chalk.gray(`  Embedding Time: ${context.metrics.embeddingTime}ms\n`)
    output += chalk.gray(`  Search Time: ${context.metrics.searchTime}ms\n`)
    output += chalk.gray(`  Cache Hit: ${context.metrics.cacheHit ? 'Yes ⚡' : 'No'}\n`)

    return output
  }

  // Helper methods
  private createProgressBar(progress: number, width: number = 30): string {
    const filled = Math.floor((progress / 100) * width)
    const empty = width - filled
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty))
  }

  private getSeverityIcon(severity: string): string {
    const icons: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: 'ℹ️',
    }
    return icons[severity] || 'ℹ️'
  }

  private getSeverityColor(severity: string): typeof chalk.red {
    const colors: Record<string, typeof chalk.red> = {
      critical: chalk.red.bold,
      high: chalk.red,
      medium: chalk.yellow,
      low: chalk.blue,
      info: chalk.gray,
    }
    return colors[severity] || chalk.gray
  }
}

// Export singleton renderer
export const ttyRenderer = new TTYArtifactRenderer()


