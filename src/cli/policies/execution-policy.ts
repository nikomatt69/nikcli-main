import type { CliConfig, ConfigManager } from '../core/config-manager'
import { logger } from '../utils/logger'

export type ApprovalPolicy = 'never' | 'untrusted' | 'on-failure' | 'always'
export type SandboxPolicy = 'read-only' | 'workspace-write' | 'system-write' | 'danger-full-access'

export interface ExecutionPolicy {
  approval: ApprovalPolicy
  sandbox: SandboxPolicy
  timeoutMs: number
  maxRetries: number
}

export interface CommandPolicy {
  command: string
  allowed: boolean
  requiresApproval: boolean
  riskLevel: 'low' | 'medium' | 'high'
  sandbox: SandboxPolicy[]
}

export interface ToolPolicy {
  toolName: string
  category: 'file' | 'git' | 'package' | 'system' | 'network' | 'analysis'
  riskLevel: 'low' | 'medium' | 'high'
  requiresApproval: boolean
  allowedInSafeMode: boolean
  description: string
  riskyOperations?: string[]
}

export interface ToolApprovalRequest {
  toolName: string
  operation: string
  args: any
  riskAssessment: {
    level: 'low' | 'medium' | 'high'
    reasons: string[]
    affectedFiles?: string[]
    irreversible?: boolean
  }
}

export class ExecutionPolicyManager {
  private configManager: InstanceType<typeof ConfigManager>
  private trustedCommands = new Set(['ls', 'cat', 'pwd', 'echo', 'which', 'whoami'])
  private dangerousCommands = new Set(['rm -rf', 'sudo', 'su', 'chmod 777', 'dd', 'mkfs'])
  private commandPolicies = new Map<string, CommandPolicy>()
  private toolPolicies = new Map<string, ToolPolicy>()
  private sessionApprovals = new Set<string>()
  private devModeExpiry: Date | null = null

  constructor(configManager: InstanceType<typeof ConfigManager>) {
    this.configManager = configManager
    this.initializeCommandPolicies()
    this.initializeToolPolicies()
  }

  async getPolicy(): Promise<ExecutionPolicy> {
    const cfg: CliConfig = this.configManager.getAll()
    return {
      approval: (cfg.approvalPolicy as ApprovalPolicy) || 'untrusted',
      sandbox: (cfg.sandbox as unknown as SandboxPolicy) || 'workspace-write',
      timeoutMs: cfg.defaultAgentTimeout || 300000,
      maxRetries: 3,
    }
  }

  async shouldAskForApproval(command: string, exitCode?: number): Promise<boolean> {
    const { approval } = await this.getPolicy()
    const cmdName = command.split(/\s+/)[0]
    const isTrusted = this.trustedCommands.has(cmdName)
    if (approval === 'never') return false
    if (approval === 'untrusted') return !isTrusted
    if (approval === 'on-failure') return exitCode !== undefined && exitCode !== 0
    return true
  }

  async allowWorkspaceWrite(): Promise<boolean> {
    const { sandbox } = await this.getPolicy()
    return sandbox === 'workspace-write' || sandbox === 'danger-full-access'
  }

  async allowGlobalWrite(): Promise<boolean> {
    const { sandbox } = await this.getPolicy()
    return sandbox === 'system-write' || sandbox === 'danger-full-access'
  }

  /**
   * Initialize command policies
   */
  private initializeCommandPolicies(): void {
    // Safe commands
    const safeCommands = ['ls', 'cat', 'pwd', 'echo', 'which', 'whoami', 'date', 'env']
    safeCommands.forEach((cmd) => {
      this.commandPolicies.set(cmd, {
        command: cmd,
        allowed: true,
        requiresApproval: false,
        riskLevel: 'low',
        sandbox: ['read-only', 'workspace-write', 'system-write', 'danger-full-access'],
      })
    })

    // Development commands
    const devCommands = ['npm', 'yarn', 'git', 'node', 'tsc', 'jest']
    devCommands.forEach((cmd) => {
      this.commandPolicies.set(cmd, {
        command: cmd,
        allowed: true,
        requiresApproval: false,
        riskLevel: 'medium',
        sandbox: ['workspace-write', 'system-write', 'danger-full-access'],
      })
    })

    // System commands
    const systemCommands = ['chmod', 'chown', 'cp', 'mv', 'mkdir', 'rmdir']
    systemCommands.forEach((cmd) => {
      this.commandPolicies.set(cmd, {
        command: cmd,
        allowed: true,
        requiresApproval: true,
        riskLevel: 'medium',
        sandbox: ['system-write', 'danger-full-access'],
      })
    })

    // Dangerous commands
    const dangerousCommands = ['rm', 'sudo', 'su', 'dd', 'mkfs', 'fdisk']
    dangerousCommands.forEach((cmd) => {
      this.commandPolicies.set(cmd, {
        command: cmd,
        allowed: false,
        requiresApproval: true,
        riskLevel: 'high',
        sandbox: ['danger-full-access'],
      })
    })
  }

  /**
   * Initialize tool policies based on security requirements
   */
  private initializeToolPolicies(): void {
    // Low-risk tools (analysis, read-only)
    const safePolicies: Array<Omit<ToolPolicy, 'toolName'>> = [
      {
        category: 'analysis',
        riskLevel: 'low',
        requiresApproval: false,
        allowedInSafeMode: true,
        description: 'Project analysis and information gathering',
      },
      {
        category: 'file',
        riskLevel: 'low',
        requiresApproval: false,
        allowedInSafeMode: true,
        description: 'Read-only file operations',
      },
    ]

    const safeTools = ['read_file', 'list_files', 'find_files', 'analyze_project', 'grep_search']
    safeTools.forEach((tool) => {
      this.toolPolicies.set(tool, {
        toolName: tool,
        ...safePolicies.find((p) => (tool.includes('file') ? p.category === 'file' : p.category === 'analysis'))!,
      })
    })

    // Medium-risk tools (file operations, git)
    const riskyTools = [
      {
        name: 'write_file',
        category: 'file' as const,
        description: 'Write content to files',
        riskyOps: ['system files', 'config files'],
      },
      {
        name: 'edit_file',
        category: 'file' as const,
        description: 'Edit existing files',
        riskyOps: ['destructive edits', 'system files'],
      },
      {
        name: 'multi_edit',
        category: 'file' as const,
        description: 'Batch file editing',
        riskyOps: ['multiple files', 'batch operations'],
      },
      { name: 'git_status', category: 'git' as const, description: 'Git status check', riskyOps: [] },
      { name: 'git_diff', category: 'git' as const, description: 'Git diff display', riskyOps: [] },
      {
        name: 'git_commit',
        category: 'git' as const,
        description: 'Git commit operation',
        riskyOps: ['permanent changes', 'history modification'],
      },
      {
        name: 'git_push',
        category: 'git' as const,
        description: 'Push to remote repository',
        riskyOps: ['remote changes', 'public repositories'],
      },
      {
        name: 'npm_install',
        category: 'package' as const,
        description: 'Install npm packages',
        riskyOps: ['global installations', 'security vulnerabilities'],
      },
    ]

    riskyTools.forEach((tool) => {
      this.toolPolicies.set(tool.name, {
        toolName: tool.name,
        category: tool.category,
        riskLevel: 'medium',
        requiresApproval: !(tool.name.includes('git_status') || tool.name.includes('git_diff')),
        allowedInSafeMode: !tool.riskyOps.some((op) => op.includes('permanent') || op.includes('destructive')),
        description: tool.description,
        riskyOperations: tool.riskyOps,
      })
    })

    // High-risk tools (system commands, dangerous operations)
    const dangerousTools = [
      {
        name: 'execute_command',
        category: 'system' as const,
        description: 'Execute system commands',
        riskyOps: ['system modification', 'data loss', 'security bypass'],
      },
      {
        name: 'delete_file',
        category: 'file' as const,
        description: 'Delete files',
        riskyOps: ['data loss', 'irreversible'],
      },
      {
        name: 'git_reset',
        category: 'git' as const,
        description: 'Git reset operations',
        riskyOps: ['history loss', 'irreversible'],
      },
      {
        name: 'network_request',
        category: 'network' as const,
        description: 'Make network requests',
        riskyOps: ['data exfiltration', 'external communication'],
      },
    ]

    dangerousTools.forEach((tool) => {
      this.toolPolicies.set(tool.name, {
        toolName: tool.name,
        category: tool.category,
        riskLevel: 'high',
        requiresApproval: true,
        allowedInSafeMode: false,
        description: tool.description,
        riskyOperations: tool.riskyOps,
      })
    })
  }

  /**
   * Get command policy
   */
  getCommandPolicy(command: string): CommandPolicy | null {
    const cmdName = command.split(/\s+/)[0]
    return this.commandPolicies.get(cmdName) || null
  }

  /**
   * Check if command is allowed in current sandbox
   */
  async isCommandAllowed(command: string): Promise<boolean> {
    const policy = this.getCommandPolicy(command)
    const { sandbox } = await this.getPolicy()

    if (!policy) {
      // Unknown command - apply default policy based on sandbox
      switch (sandbox) {
        case 'read-only':
          return this.trustedCommands.has(command.split(/\s+/)[0])
        case 'workspace-write':
        case 'system-write':
          return !this.dangerousCommands.has(command)
        case 'danger-full-access':
          return true
        default:
          return false
      }
    }

    return policy.allowed && policy.sandbox.includes(sandbox)
  }

  /**
   * Evaluate command risk
   */
  async evaluateCommandRisk(command: string): Promise<{
    riskLevel: 'low' | 'medium' | 'high'
    reasons: string[]
    requiresApproval: boolean
    allowed: boolean
  }> {
    const policy = this.getCommandPolicy(command)
    const { sandbox, approval } = await this.getPolicy()

    const reasons: string[] = []
    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    let requiresApproval = false
    let allowed = true

    // Check if command exists in policy
    if (policy) {
      riskLevel = policy.riskLevel
      requiresApproval = policy.requiresApproval
      allowed = policy.allowed && policy.sandbox.includes(sandbox)

      if (!policy.sandbox.includes(sandbox)) {
        reasons.push(`Command not allowed in ${sandbox} sandbox`)
        allowed = false
      }
    } else {
      // Unknown command evaluation
      const cmdName = command.split(/\s+/)[0]

      if (this.dangerousCommands.has(command) || this.dangerousCommands.has(cmdName)) {
        riskLevel = 'high'
        requiresApproval = true
        allowed = sandbox === 'danger-full-access'
        reasons.push('Command identified as dangerous')
      } else if (!this.trustedCommands.has(cmdName)) {
        riskLevel = 'medium'
        requiresApproval = approval === 'untrusted' || approval === 'always'
        reasons.push('Unknown command')
      }
    }

    // Apply approval policy
    if (approval === 'always') {
      requiresApproval = true
      reasons.push('Always require approval policy active')
    } else if (approval === 'never') {
      requiresApproval = false
    }

    return {
      riskLevel,
      reasons,
      requiresApproval,
      allowed,
    }
  }

  /**
   * Get tool policy
   */
  getToolPolicy(toolName: string): ToolPolicy | null {
    return this.toolPolicies.get(toolName) || null
  }

  /**
   * Check if tool operation should require approval
   */
  async shouldApproveToolOperation(
    toolName: string,
    operation: string,
    args: any
  ): Promise<ToolApprovalRequest | null> {
    const config = this.configManager.getAll()
    const toolPolicy = this.getToolPolicy(toolName)
    const securityMode = config.securityMode
    const toolApprovalPolicies = config.toolApprovalPolicies

    // Check developer mode bypass
    if (this.isDevModeActive() && toolPolicy?.riskLevel !== 'high') {
      return null // Skip approval for non-high risk tools in dev mode
    }

    // Check session approvals
    const sessionKey = `${toolName}:${operation}`
    if (this.sessionApprovals.has(sessionKey)) {
      return null // Already approved for this session
    }

    if (!toolPolicy) {
      // Unknown tool - treat as medium risk
      return {
        toolName,
        operation,
        args,
        riskAssessment: {
          level: 'medium',
          reasons: ['Unknown tool - requires approval for safety'],
          irreversible: false,
        },
      }
    }

    const riskAssessment = this.assessToolRisk(toolName, operation, args, toolPolicy)
    const categoryPolicy = this.getCategoryApprovalPolicy(toolPolicy.category, toolApprovalPolicies)

    // Determine if approval is needed
    let needsApproval = false

    switch (categoryPolicy) {
      case 'always':
        needsApproval = true
        break
      case 'risky':
        needsApproval = riskAssessment.level === 'medium' || riskAssessment.level === 'high'
        break
      case 'never':
        needsApproval = false
        break
    }

    // Override based on security mode
    if (securityMode === 'safe') {
      needsApproval = needsApproval || !toolPolicy.allowedInSafeMode
    } else if (securityMode === 'developer') {
      needsApproval = needsApproval && riskAssessment.level === 'high'
    }

    return needsApproval
      ? {
          toolName,
          operation,
          args,
          riskAssessment,
        }
      : null
  }

  /**
   * Assess risk level for a specific tool operation
   */
  private assessToolRisk(
    toolName: string,
    operation: string,
    args: any,
    policy: ToolPolicy
  ): {
    level: 'low' | 'medium' | 'high'
    reasons: string[]
    affectedFiles?: string[]
    irreversible?: boolean
  } {
    const reasons: string[] = []
    let level = policy.riskLevel
    const affectedFiles: string[] = []
    let irreversible = false

    // File-specific risk assessment
    if (policy.category === 'file') {
      if (args.filePath || args.path) {
        const filePath = args.filePath || args.path
        affectedFiles.push(filePath)

        // System file detection
        if (this.isSystemFile(filePath)) {
          level = 'high'
          reasons.push('Affects system files')
        }

        // Config file detection
        if (this.isConfigFile(filePath)) {
          level = 'medium'
          reasons.push('Affects configuration files')
        }
      }

      if (toolName === 'delete_file' || operation.includes('delete')) {
        irreversible = true
        reasons.push('Irreversible file deletion')
      }
    }

    // Git-specific risk assessment
    if (policy.category === 'git') {
      if (toolName.includes('push') || toolName.includes('commit')) {
        irreversible = true
        reasons.push('Permanent git operation')
      }

      if (args.force || operation.includes('force')) {
        level = 'high'
        reasons.push('Force operation detected')
      }
    }

    // System command risk assessment
    if (policy.category === 'system') {
      if (args.command) {
        const command = args.command.toLowerCase()
        if (this.dangerousCommands.has(command) || command.includes('sudo') || command.includes('rm')) {
          level = 'high'
          irreversible = true
          reasons.push('Dangerous system command')
        }
      }
    }

    return { level, reasons, affectedFiles, irreversible }
  }

  /**
   * Get approval policy for tool category
   */
  private getCategoryApprovalPolicy(category: string, policies: any): 'always' | 'risky' | 'never' {
    switch (category) {
      case 'file':
        return policies.fileOperations
      case 'git':
        return policies.gitOperations
      case 'package':
        return policies.packageOperations
      case 'system':
        return policies.systemCommands
      case 'network':
        return policies.networkRequests
      default:
        return 'risky' // Safe default
    }
  }

  /**
   * Check if file is a system file
   */
  private isSystemFile(filePath: string): boolean {
    const systemPaths = ['/etc', '/usr', '/var', '/bin', '/sbin', '/boot']
    return systemPaths.some((path) => filePath.startsWith(path))
  }

  /**
   * Check if file is a configuration file
   */
  private isConfigFile(filePath: string): boolean {
    const configExtensions = ['.config', '.conf', '.ini', '.env', '.json', '.yaml', '.yml']
    const configNames = ['Dockerfile', 'Makefile', 'package.json', 'tsconfig.json']

    return configExtensions.some((ext) => filePath.endsWith(ext)) || configNames.some((name) => filePath.endsWith(name))
  }

  /**
   * Enable developer mode for a session
   */
  enableDevMode(timeoutMs?: number): void {
    const timeout = timeoutMs || this.configManager.getAll().sessionSettings.devModeTimeoutMs
    this.devModeExpiry = new Date(Date.now() + timeout)
  }

  /**
   * Check if developer mode is currently active
   */
  isDevModeActive(): boolean {
    if (!this.devModeExpiry) return false
    return new Date() < this.devModeExpiry
  }

  /**
   * Add session approval (valid until session ends)
   */
  addSessionApproval(toolName: string, operation: string): void {
    this.sessionApprovals.add(`${toolName}:${operation}`)
  }

  /**
   * Validate network access to a URL based on trusted domains
   */
  validateNetworkAccess(url: string): { allowed: boolean; reason?: string } {
    try {
      const urlObj = new URL(url)
      const domain = urlObj.hostname
      const config = this.configManager.getAll()

      // Check if networking is disabled globally
      if (!config.sandbox.allowNetwork) {
        return { allowed: false, reason: 'Network access disabled in sandbox' }
      }

      // Check if domain is in trusted list
      const trustedDomains = config.sandbox.trustedDomains || []
      const isAllowed = trustedDomains.some((trustedDomain) => {
        // Exact match or subdomain match
        return domain === trustedDomain || domain.endsWith(`.${trustedDomain}`)
      })

      if (!isAllowed) {
        return {
          allowed: false,
          reason: `Domain '${domain}' not in trusted domains list. Allowed domains: ${trustedDomains.join(', ')}`,
        }
      }

      return { allowed: true }
    } catch (_error) {
      return { allowed: false, reason: `Invalid URL: ${url}` }
    }
  }

  /**
   * Clear session approvals
   */
  clearSessionApprovals(): void {
    this.sessionApprovals.clear()
  }

  /**
   * Log policy decision for audit trail
   */
  async logPolicyDecision(
    command: string,
    decision: 'allowed' | 'denied' | 'requires_approval',
    context: Record<string, any> = {}
  ): Promise<void> {
    await logger.audit('execution_policy_decision', {
      command,
      decision,
      timestamp: new Date().toISOString(),
      sandbox: (await this.getPolicy()).sandbox,
      approvalPolicy: (await this.getPolicy()).approval,
      ...context,
    })
  }

  /**
   * Get policy summary for display
   */
  async getPolicySummary(): Promise<{
    currentPolicy: ExecutionPolicy
    allowedCommands: number
    deniedCommands: number
    trustedCommands: string[]
    dangerousCommands: string[]
  }> {
    const policy = await this.getPolicy()
    const allowedCommands = Array.from(this.commandPolicies.values()).filter(
      (p) => p.allowed && p.sandbox.includes(policy.sandbox)
    ).length
    const deniedCommands = Array.from(this.commandPolicies.values()).filter(
      (p) => !p.allowed || !p.sandbox.includes(policy.sandbox)
    ).length

    return {
      currentPolicy: policy,
      allowedCommands,
      deniedCommands,
      trustedCommands: Array.from(this.trustedCommands),
      dangerousCommands: Array.from(this.dangerousCommands),
    }
  }
}
