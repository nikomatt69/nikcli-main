import * as fs from 'node:fs'
import * as path from 'node:path'

export interface ToolExecutionResult {
  success: boolean
  data: any
  error?: string
  metadata: {
    executionTime: number
    toolName: string
    parameters: any
    riskLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical'
    operationType?: 'read' | 'write' | 'delete' | 'exec' | 'network' | 'other'
    approved?: boolean
    approver?: string
    approvalPolicy?: string
    preflightDuration?: number
    sessionApproved?: boolean
    sessionId?: string
    approvalScope?: string
    riskMax?: 'none' | 'low' | 'medium' | 'high' | 'critical'
  }
}

export abstract class BaseTool {
  protected name: string

  constructor(
    name: string,
    protected workingDirectory: string
  ) {
    this.name = name
    // Normalize working directory to an absolute, real path when possible
    try {
      const candidate = fs.existsSync(workingDirectory)
        ? fs.realpathSync(workingDirectory)
        : path.resolve(workingDirectory)
      this.workingDirectory = path.isAbsolute(candidate) ? candidate : path.resolve(candidate)
    } catch {
      // Fallback to resolved path if realpath fails
      const candidate = path.resolve(workingDirectory)
      this.workingDirectory = path.isAbsolute(candidate) ? candidate : candidate
    }
  }

  abstract execute(...args: any[]): Promise<ToolExecutionResult>

  /**
   * Enterprise guard: runs a fast preflight, requests approval when needed,
   * supports session-level approvals, then executes the action.
   */
  protected async runWithEnterpriseGuard(
    info: {
      operationType: 'read' | 'write' | 'delete' | 'exec' | 'network' | 'other'
      parameters: any
      preflight: () => Promise<{
        riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical'
        reasons?: string[]
        affectedPaths?: string[]
        summary?: string
      }> | {
        riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical'
        reasons?: string[]
        affectedPaths?: string[]
        summary?: string
      }
      action: () => Promise<ToolExecutionResult>
      enterpriseOptions?: {
        requireApproval?: boolean
        approveForSession?: boolean
        sessionId?: string
        approvalScope?: 'tool' | 'tool+opType'
        riskMax?: 'none' | 'low' | 'medium' | 'high' | 'critical'
      }
    }
  ): Promise<ToolExecutionResult> {
    const { operationType, preflight, action, enterpriseOptions } = info
    const { approvalSystem } = require('../ui/approval-system')
    const { SessionApprovalManager } = require('./session-approval')
    const session = new SessionApprovalManager()

    const startPreflight = Date.now()
    const report = await Promise.resolve(preflight())
    const preflightDuration = Date.now() - startPreflight

    const risk = report.riskLevel || 'low'
    const sessionId = enterpriseOptions?.sessionId || 'default'
    const scope = enterpriseOptions?.approvalScope || 'tool+opType'
    const riskMax = enterpriseOptions?.riskMax || 'high'

    // Check session-level approval
    if (session.isApproved({
      sessionId,
      toolName: this.name,
      scope,
      operationType,
      riskLevel: risk,
    })) {
      const result = await action()
      result.metadata = {
        ...result.metadata,
        operationType,
        riskLevel: risk,
        preflightDuration,
        approved: true,
        sessionApproved: true,
        sessionId,
        approvalScope: scope,
        riskMax,
      }
      return result
    }

    // Determine if approval is needed
    const needsApproval = enterpriseOptions?.requireApproval === true || ['medium', 'high', 'critical'].includes(risk)

    if (needsApproval) {
      const approved = await approvalSystem.confirm(
        `Approve ${this.name} ${operationType} operation?`,
        report.summary || (report.reasons && report.reasons.join('; ')) || undefined,
        false
      )
      if (!approved) {
        return {
          success: false,
          data: null,
          error: 'Operation not approved',
          metadata: {
            executionTime: 0,
            toolName: this.name,
            parameters: info.parameters,
            riskLevel: risk,
            operationType,
            preflightDuration,
          },
        }
      }

      // Optional: approve for session prompt if not explicitly set
      let sessionApproved = false
      if (enterpriseOptions?.approveForSession || enterpriseOptions?.approveForSession === undefined) {
        sessionApproved = await approvalSystem.confirm(
          `Also approve ${this.name} (${scope}) for this session?`,
          'You can skip future prompts for this tool while risk stays within the allowed level.',
          false
        )
      }

      if (sessionApproved) {
        session.approve({ sessionId, toolName: this.name, scope, operationType, riskMax })
      }
    }

    // Run action
    const result = await action()
    result.metadata = {
      ...result.metadata,
      operationType,
      riskLevel: risk,
      preflightDuration,
      approved: needsApproval ? true : undefined,
      sessionApproved: session.isApproved({ sessionId, toolName: this.name, scope, operationType, riskLevel: risk }),
      sessionId,
      approvalScope: scope,
      riskMax,
    }
    return result
  }

  /**
   * Verifica se un percorso è sicuro (dentro working directory)
   */
  protected isPathSafe(path: string): boolean {
    const _fs = require('node:fs')
    const pathModule = require('path')

    try {
      const resolvedPath = pathModule.resolve(this.workingDirectory, path)
      const resolvedWorkingDir = pathModule.resolve(this.workingDirectory)

      return resolvedPath.startsWith(resolvedWorkingDir)
    } catch (_error) {
      return false
    }
  }

  /**
   * Ottiene il nome del tool
   */
  getName(): string {
    return this.name
  }

  /**
   * Ottiene la working directory
   */
  getWorkingDirectory(): string {
    return this.workingDirectory
  }
}
