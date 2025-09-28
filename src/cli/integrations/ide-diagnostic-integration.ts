import chalk from 'chalk'
import { mcpClient } from '../core/mcp-client'

/**
 * IDE Diagnostic Integration for Workflow Analysis
 *
 * This module integrates the IDE diagnostic server with existing workflow
 * analysis systems like code review, project analysis, and debugging.
 */

export interface WorkflowDiagnosticContext {
  errors: number
  warnings: number
  buildStatus: 'success' | 'failed' | 'unknown'
  lintStatus: 'clean' | 'issues' | 'unknown'
  testStatus: 'passing' | 'failing' | 'unknown'
  vcsStatus: {
    branch: string
    hasChanges: boolean
    stagedFiles: number
    unstagedFiles: number
  }
  affectedFiles: string[]
  recommendations: string[]
}

export class IDEDiagnosticIntegration {
  private static instance: IDEDiagnosticIntegration
  private isActive: boolean = true

  private constructor() {
    this.setupWorkflowIntegration()
  }

  static getInstance(): IDEDiagnosticIntegration {
    if (!IDEDiagnosticIntegration.instance) {
      IDEDiagnosticIntegration.instance = new IDEDiagnosticIntegration()
    }
    return IDEDiagnosticIntegration.instance
  }

  /**
   * Get comprehensive diagnostic context for workflow analysis
   */
  async getWorkflowContext(): Promise<WorkflowDiagnosticContext> {
    if (!this.isActive) {
      return this.getEmptyContext()
    }

    try {
      // Get current diagnostics
      const diagnosticsResponse = await mcpClient.call('ide-diagnostic', {
        method: 'diag.list',
        params: {},
        id: 'workflow-context',
      })

      const diagnostics = diagnosticsResponse.result || []
      const errors = diagnostics.filter((d: any) => d.severity === 'error').length
      const warnings = diagnostics.filter((d: any) => d.severity === 'warning').length
      const affectedFiles = [...new Set(diagnostics.map((d: any) => d.file))]

      // Get build status
      let buildStatus: 'success' | 'failed' | 'unknown' = 'unknown'
      try {
        const buildResponse = await mcpClient.call('ide-diagnostic', {
          method: 'build.run',
          params: {},
          id: 'workflow-build',
        })
        buildStatus = buildResponse.result?.summary?.success ? 'success' : 'failed'
      } catch {
        // Build not available or failed
        buildStatus = 'unknown'
      }

      // Get lint status
      let lintStatus: 'clean' | 'issues' | 'unknown' = 'unknown'
      try {
        const lintResponse = await mcpClient.call('ide-diagnostic', {
          method: 'lint.run',
          params: {},
          id: 'workflow-lint',
        })
        const lintSummary = lintResponse.result?.summary
        lintStatus = lintSummary?.errors === 0 && lintSummary?.warnings === 0 ? 'clean' : 'issues'
      } catch {
        lintStatus = 'unknown'
      }

      // Get test status
      let testStatus: 'passing' | 'failing' | 'unknown' = 'unknown'
      try {
        const testResponse = await mcpClient.call('ide-diagnostic', {
          method: 'test.run',
          params: {},
          id: 'workflow-test',
        })
        const testSummary = testResponse.result?.summary
        testStatus = testSummary?.failed === 0 ? 'passing' : 'failing'
      } catch {
        testStatus = 'unknown'
      }

      // Get VCS status
      let vcsStatus = {
        branch: 'unknown',
        hasChanges: false,
        stagedFiles: 0,
        unstagedFiles: 0,
      }

      try {
        const vcsResponse = await mcpClient.call('ide-diagnostic', {
          method: 'vcs.status',
          params: {},
          id: 'workflow-vcs',
        })
        const vcs = vcsResponse.result
        vcsStatus = {
          branch: vcs?.branch || 'unknown',
          hasChanges: (vcs?.staged?.length || 0) + (vcs?.unstaged?.length || 0) + (vcs?.untracked?.length || 0) > 0,
          stagedFiles: vcs?.staged?.length || 0,
          unstagedFiles: (vcs?.unstaged?.length || 0) + (vcs?.untracked?.length || 0),
        }
      } catch {
        // VCS not available
      }

      // Generate recommendations
      const recommendations = this.generateRecommendations({
        errors,
        warnings,
        buildStatus,
        lintStatus,
        testStatus,
        vcsStatus,
        affectedFiles: affectedFiles as string[],
      })

      return {
        errors,
        warnings,
        buildStatus,
        lintStatus,
        testStatus,
        vcsStatus,
        affectedFiles: affectedFiles as string[],
        recommendations,
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not get diagnostic context:', error))
      return this.getEmptyContext()
    }
  }

  /**
   * Get diagnostics for specific file (used in code review)
   */
  async getFileDiagnostics(filePath: string): Promise<{
    diagnostics: any[]
    related: any[]
    summary: string
  }> {
    if (!this.isActive) {
      return { diagnostics: [], related: [], summary: 'Diagnostics not available' }
    }

    try {
      const response = await mcpClient.call('ide-diagnostic', {
        method: 'diag.get',
        params: { file: filePath },
        id: 'file-diagnostics',
      })

      const result = response.result || { diagnostics: [], related: [] }
      const diagnostics = result.diagnostics || []
      const related = result.related || []

      const errors = diagnostics.filter((d: any) => d.severity === 'error').length
      const warnings = diagnostics.filter((d: any) => d.severity === 'warning').length

      let summary = 'No issues found'
      if (errors > 0 || warnings > 0) {
        const parts = []
        if (errors > 0) parts.push(`${errors} error${errors !== 1 ? 's' : ''}`)
        if (warnings > 0) parts.push(`${warnings} warning${warnings !== 1 ? 's' : ''}`)
        summary = parts.join(', ')
      }

      return { diagnostics, related, summary }
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not get diagnostics for ${filePath}:`, error))
      return { diagnostics: [], related: [], summary: 'Error getting diagnostics' }
    }
  }

  /**
   * Run comprehensive project analysis
   */
  async runProjectAnalysis(): Promise<{
    health: 'healthy' | 'degraded' | 'unhealthy'
    summary: string
    details: any
    recommendations: string[]
  }> {
    if (!this.isActive) {
      return {
        health: 'unhealthy',
        summary: 'IDE diagnostics not available',
        details: {},
        recommendations: ['Enable IDE diagnostics for project analysis'],
      }
    }

    try {
      const context = await this.getWorkflowContext()

      // Determine overall health
      let health: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

      if (context.errors > 0) {
        health = 'unhealthy'
      } else if (context.warnings > 5 || context.buildStatus === 'failed' || context.testStatus === 'failing') {
        health = 'degraded'
      }

      // Generate summary
      const parts = []
      if (context.errors > 0) parts.push(`${context.errors} errors`)
      if (context.warnings > 0) parts.push(`${context.warnings} warnings`)
      if (context.buildStatus === 'failed') parts.push('build failing')
      if (context.testStatus === 'failing') parts.push('tests failing')

      const summary = parts.length > 0 ? `Issues found: ${parts.join(', ')}` : 'Project looks healthy'

      // Get additional details
      const healthResponse = await mcpClient.call('ide-diagnostic', {
        method: 'health',
        params: {},
        id: 'project-health',
      })

      return {
        health,
        summary,
        details: {
          ...context,
          toolsAvailable: healthResponse.result?.details || {},
        },
        recommendations: context.recommendations,
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Project analysis failed:', error))
      return {
        health: 'unhealthy',
        summary: 'Analysis failed',
        details: {},
        recommendations: ['Check IDE diagnostic server status'],
      }
    }
  }

  /**
   * Get quick status for CLI display
   */
  async getQuickStatus(): Promise<string> {
    if (!this.isActive) {
      return chalk.gray('IDE: off')
    }

    try {
      const diagnosticsResponse = await mcpClient.call('ide-diagnostic', {
        method: 'diag.list',
        params: {},
        id: 'quick-status',
      })

      const diagnostics = diagnosticsResponse.result || []
      const errors = diagnostics.filter((d: any) => d.severity === 'error').length
      const warnings = diagnostics.filter((d: any) => d.severity === 'warning').length

      if (errors > 0) {
        return chalk.red(`IDE: ${errors}E, ${warnings}W`)
      } else if (warnings > 0) {
        return chalk.yellow(`IDE: ${warnings}W`)
      } else {
        return chalk.green('IDE: ✓')
      }
    } catch (_error) {
      return chalk.gray('IDE: error')
    }
  }

  /**
   * Subscribe to diagnostic events for real-time updates
   */
  subscribeToDiagnosticEvents(_callback: (event: any) => void): () => void {
    if (!this.isActive) {
      return () => {}
    }

    try {
      // Subscribe to diagnostic events via MCP client
      const subscribeRequest = async () => {
        const response = await mcpClient.call('ide-diagnostic', {
          method: 'diag.subscribe',
          params: {},
          id: 'event-subscription',
        })

        if (response.result?.subscribed) {
          console.log(chalk.green('✓ Subscribed to IDE diagnostic events'))
          // Note: Real-time events would require WebSocket or polling
          // For now, this confirms subscription capability
        }
      }

      subscribeRequest().catch((error) => {
        console.warn(chalk.yellow('Warning: Could not subscribe to diagnostic events:', error))
      })

      return () => {
        console.log(chalk.gray('📝 Unsubscribed from diagnostic events'))
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not subscribe to diagnostic events:', error))
      return () => {}
    }
  }

  /**
   * Start monitoring a specific path via MCP
   */
  async startMonitoring(path?: string): Promise<void> {
    try {
      const response = await mcpClient.call('ide-diagnostic', {
        method: 'monitor.start',
        params: { path },
        id: 'start-monitoring',
      })

      if (response.result?.status === 'started') {
        console.log(chalk.green(`🔍 Started monitoring: ${response.result.path}`))
      }
    } catch (error: any) {
      console.error(chalk.red(`Failed to start monitoring: ${error.message}`))
    }
  }

  /**
   * Stop monitoring via MCP
   */
  async stopMonitoring(path?: string): Promise<void> {
    try {
      const response = await mcpClient.call('ide-diagnostic', {
        method: 'monitor.stop',
        params: { path },
        id: 'stop-monitoring',
      })

      if (response.result?.status === 'stopped') {
        console.log(chalk.yellow(`🔍 Stopped monitoring: ${response.result.path}`))
      }
    } catch (error: any) {
      console.error(chalk.red(`Failed to stop monitoring: ${error.message}`))
    }
  }

  /**
   * Get monitoring status via MCP
   */
  async getMonitoringStatus(): Promise<any> {
    try {
      const response = await mcpClient.call('ide-diagnostic', {
        method: 'monitor.status',
        params: {},
        id: 'monitoring-status',
      })

      return response.result || { enabled: false, watchedPaths: [], totalWatchers: 0 }
    } catch (error: any) {
      console.error(chalk.red(`Failed to get monitoring status: ${error.message}`))
      return { enabled: false, watchedPaths: [], totalWatchers: 0 }
    }
  }

  /**
   * Enable/disable the integration
   */
  setActive(active: boolean): void {
    this.isActive = active
    console.log(chalk.blue(`🔧 IDE Diagnostic Integration ${active ? 'enabled' : 'disabled'}`))
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private setupWorkflowIntegration(): void {
    // The integration is now available for use by workflow systems
    console.log(chalk.blue('🔧 IDE Diagnostic Integration initialized'))
  }

  private getEmptyContext(): WorkflowDiagnosticContext {
    return {
      errors: 0,
      warnings: 0,
      buildStatus: 'unknown',
      lintStatus: 'unknown',
      testStatus: 'unknown',
      vcsStatus: {
        branch: 'unknown',
        hasChanges: false,
        stagedFiles: 0,
        unstagedFiles: 0,
      },
      affectedFiles: [],
      recommendations: ['Enable IDE diagnostics for better analysis'],
    }
  }

  private generateRecommendations(context: Partial<WorkflowDiagnosticContext>): string[] {
    const recommendations: string[] = []

    if (context.errors && context.errors > 0) {
      recommendations.push(`Fix ${context.errors} critical error${context.errors !== 1 ? 's' : ''} before proceeding`)
    }

    if (context.warnings && context.warnings > 5) {
      recommendations.push(`Consider addressing ${context.warnings} warnings for code quality`)
    }

    if (context.buildStatus === 'failed') {
      recommendations.push('Fix build errors to ensure project compiles correctly')
    }

    if (context.lintStatus === 'issues') {
      recommendations.push('Run linter and fix style/quality issues')
    }

    if (context.testStatus === 'failing') {
      recommendations.push('Fix failing tests before deployment')
    }

    if (context.vcsStatus?.hasChanges) {
      if (context.vcsStatus.unstagedFiles > 0) {
        recommendations.push('Stage and commit your changes')
      }
      if (context.vcsStatus.stagedFiles > 0) {
        recommendations.push('Commit staged changes')
      }
    }

    if (context.affectedFiles && context.affectedFiles.length > 10) {
      recommendations.push('Consider breaking changes into smaller commits')
    }

    if (recommendations.length === 0) {
      recommendations.push('Project status looks good! 🎉')
    }

    return recommendations
  }
}

// Export singleton instance
export const ideDiagnosticIntegration = IDEDiagnosticIntegration.getInstance()

// Auto-integration with workflow systems
export function integrateWithWorkflows(): void {
  // The integration is automatically available for use by:
  // - Code review workflows
  // - Project analysis commands
  // - Debug workflows
  // - CLI status displays

  console.log(chalk.blue('🔧 IDE Diagnostic workflow integration ready'))
}

// Helper functions for common workflow patterns
export async function getProjectHealthSummary(): Promise<string> {
  const analysis = await ideDiagnosticIntegration.runProjectAnalysis()
  return `${analysis.health.toUpperCase()}: ${analysis.summary}`
}

export async function shouldBlockCodeReview(): Promise<{ block: boolean; reason?: string }> {
  const context = await ideDiagnosticIntegration.getWorkflowContext()

  if (context.errors > 0) {
    return {
      block: true,
      reason: `${context.errors} error${context.errors !== 1 ? 's' : ''} must be fixed`,
    }
  }

  if (context.buildStatus === 'failed') {
    return {
      block: true,
      reason: 'Build is failing',
    }
  }

  return { block: false }
}

export async function getCodeReviewInsights(files: string[]): Promise<
  {
    file: string
    issues: number
    summary: string
  }[]
> {
  const insights = await Promise.all(
    files.map(async (file) => {
      const diag = await ideDiagnosticIntegration.getFileDiagnostics(file)
      return {
        file,
        issues: diag.diagnostics.length,
        summary: diag.summary,
      }
    })
  )

  return insights
}
