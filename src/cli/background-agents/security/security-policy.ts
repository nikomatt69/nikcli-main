// src/cli/background-agents/security/security-policy.ts

import type { BackgroundJob, EnvironmentPolicies, HeadlessOptions, NikEnvironment } from '../types'

export interface SecurityViolation {
  type: 'command' | 'network' | 'file' | 'resource' | 'time'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  details: any
  timestamp: Date
  jobId?: string
}

export interface ResourceMonitor {
  memoryUsageMB: number
  cpuPercent: number
  diskUsageMB: number
  networkRequests: number
  executionTimeMs: number
}

export class SecurityPolicy {
  private violations: SecurityViolation[] = []
  private resourceMonitors = new Map<string, ResourceMonitor>()

  // Default blocked commands
  private static readonly BLOCKED_COMMANDS = [
    'rm -rf /',
    'sudo rm',
    'format',
    'dd if=',
    'shutdown',
    'reboot',
    'halt',
    'poweroff',
    'mkfs',
    'fdisk',
    'parted',
    'wipefs',
    'shred',
    ':(){ :|:& };:', // Fork bomb
    'curl http://', // Potentially unsafe HTTP
    'wget http://',
  ]

  // Commands that require approval even in safe mode
  private static readonly APPROVAL_REQUIRED = [
    'sudo',
    'chmod 777',
    'chmod -R 777',
    'usermod',
    'systemctl',
    'service',
    'npm install -g',
    'yarn global',
    'pnpm add -g',
    'pip install --user',
  ]

  // Default allowed domains for network access
  private static readonly DEFAULT_ALLOWED_DOMAINS = [
    'registry.npmjs.org',
    'yarnpkg.com',
    'registry.yarnpkg.com',
    'github.com',
    'api.github.com',
    'raw.githubusercontent.com',
    'api.openai.com',
    'api.anthropic.com',
    'cloudflare.com',
    'googleapis.com',
  ]

  /**
   * Validate command against security policies
   */
  static validateCommand(
    command: string,
    policies: EnvironmentPolicies,
    safeMode: boolean = true,
    jobId?: string
  ): { allowed: boolean; violations: SecurityViolation[] } {
    const violations: SecurityViolation[] = []

    // Check blocked commands
    for (const blocked of SecurityPolicy.BLOCKED_COMMANDS) {
      if (command.toLowerCase().includes(blocked.toLowerCase())) {
        violations.push({
          type: 'command',
          severity: 'critical',
          message: `Blocked dangerous command: ${blocked}`,
          details: { command, blocked },
          timestamp: new Date(),
          jobId,
        })
      }
    }

    // Check explicitly denied commands in policies
    if (policies.blockedCommands) {
      for (const blocked of policies.blockedCommands) {
        if (command.includes(blocked)) {
          violations.push({
            type: 'command',
            severity: 'high',
            message: `Command blocked by policy: ${blocked}`,
            details: { command, blocked },
            timestamp: new Date(),
            jobId,
          })
        }
      }
    }

    // Check if command requires approval in safe mode
    if (safeMode) {
      for (const approval of SecurityPolicy.APPROVAL_REQUIRED) {
        if (command.includes(approval) && !policies.allowedCommands?.includes(command)) {
          violations.push({
            type: 'command',
            severity: 'medium',
            message: `Command requires approval in safe mode: ${approval}`,
            details: { command, approval },
            timestamp: new Date(),
            jobId,
          })
        }
      }
    }

    // Check whitelist if defined
    if (policies.allowedCommands && policies.allowedCommands.length > 0) {
      const commandAllowed = policies.allowedCommands.some(
        (allowed) => command.startsWith(allowed) || command.includes(allowed)
      )

      if (!commandAllowed) {
        violations.push({
          type: 'command',
          severity: 'medium',
          message: 'Command not in allowed commands list',
          details: { command, allowedCommands: policies.allowedCommands },
          timestamp: new Date(),
          jobId,
        })
      }
    }

    return {
      allowed: violations.filter((v) => v.severity === 'critical' || v.severity === 'high').length === 0,
      violations,
    }
  }

  /**
   * Validate network request
   */
  static validateNetworkRequest(
    url: string,
    policies: EnvironmentPolicies,
    jobId?: string
  ): { allowed: boolean; violations: SecurityViolation[] } {
    const violations: SecurityViolation[] = []

    // Check network policy
    if (policies.networkPolicy === 'deny') {
      violations.push({
        type: 'network',
        severity: 'high',
        message: 'Network access is denied by policy',
        details: { url, policy: 'deny' },
        timestamp: new Date(),
        jobId,
      })
      return { allowed: false, violations }
    }

    if (policies.networkPolicy === 'restricted') {
      const allowedDomains = policies.allowedDomains || SecurityPolicy.DEFAULT_ALLOWED_DOMAINS
      const urlObj = new URL(url)
      const domain = urlObj.hostname

      const domainAllowed = allowedDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))

      if (!domainAllowed) {
        violations.push({
          type: 'network',
          severity: 'medium',
          message: `Domain not in allowed list: ${domain}`,
          details: { url, domain, allowedDomains },
          timestamp: new Date(),
          jobId,
        })
      }
    }

    // Check for potentially unsafe protocols
    const urlObj = new URL(url)
    if (urlObj.protocol === 'ftp:' || urlObj.protocol === 'file:') {
      violations.push({
        type: 'network',
        severity: 'medium',
        message: `Potentially unsafe protocol: ${urlObj.protocol}`,
        details: { url, protocol: urlObj.protocol },
        timestamp: new Date(),
        jobId,
      })
    }

    return {
      allowed: violations.filter((v) => v.severity === 'critical' || v.severity === 'high').length === 0,
      violations,
    }
  }

  /**
   * Validate file access
   */
  static validateFileAccess(
    filePath: string,
    operation: 'read' | 'write' | 'execute' | 'delete',
    policies: EnvironmentPolicies,
    jobId?: string
  ): { allowed: boolean; violations: SecurityViolation[] } {
    const violations: SecurityViolation[] = []

    // Check for dangerous file operations
    const dangerousPaths = [
      '/etc/',
      '/var/log/',
      '/home/',
      '/root/',
      '/sys/',
      '/proc/',
      '/dev/',
      '/boot/',
      '/usr/bin/',
      '/usr/sbin/',
    ]

    if (operation === 'write' || operation === 'delete') {
      for (const dangerous of dangerousPaths) {
        if (filePath.startsWith(dangerous)) {
          violations.push({
            type: 'file',
            severity: 'critical',
            message: `Dangerous file operation in system directory: ${dangerous}`,
            details: { filePath, operation, dangerous },
            timestamp: new Date(),
            jobId,
          })
        }
      }
    }

    // Check file size limits for writes
    if (operation === 'write' && policies.maxFileSize) {
      try {
        const fs = require('fs')
        const stats = fs.statSync(filePath)
        if (stats.size > policies.maxFileSize) {
          violations.push({
            type: 'file',
            severity: 'medium',
            message: `File size exceeds limit: ${stats.size} > ${policies.maxFileSize}`,
            details: { filePath, size: stats.size, limit: policies.maxFileSize },
            timestamp: new Date(),
            jobId,
          })
        }
      } catch {
        // File doesn't exist yet, which is fine for writes
      }
    }

    return {
      allowed: violations.filter((v) => v.severity === 'critical').length === 0,
      violations,
    }
  }

  /**
   * Monitor resource usage
   */
  async monitorResources(
    jobId: string,
    policies: EnvironmentPolicies
  ): Promise<{ violations: SecurityViolation[]; monitor: ResourceMonitor }> {
    const violations: SecurityViolation[] = []

    // Get current resource usage
    const monitor = await this.getCurrentResourceUsage(jobId)
    this.resourceMonitors.set(jobId, monitor)

    // Check memory usage
    if (policies.maxMemoryMB && monitor.memoryUsageMB > policies.maxMemoryMB) {
      violations.push({
        type: 'resource',
        severity: 'high',
        message: `Memory usage exceeds limit: ${monitor.memoryUsageMB}MB > ${policies.maxMemoryMB}MB`,
        details: { memoryUsage: monitor.memoryUsageMB, limit: policies.maxMemoryMB },
        timestamp: new Date(),
        jobId,
      })
    }

    // Check CPU usage
    if (policies.maxCpuPercent && monitor.cpuPercent > policies.maxCpuPercent) {
      violations.push({
        type: 'resource',
        severity: 'medium',
        message: `CPU usage exceeds limit: ${monitor.cpuPercent}% > ${policies.maxCpuPercent}%`,
        details: { cpuUsage: monitor.cpuPercent, limit: policies.maxCpuPercent },
        timestamp: new Date(),
        jobId,
      })
    }

    // Check execution time
    if (policies.timeoutMinutes) {
      const timeoutMs = policies.timeoutMinutes * 60 * 1000
      if (monitor.executionTimeMs > timeoutMs) {
        violations.push({
          type: 'time',
          severity: 'high',
          message: `Execution time exceeds limit: ${monitor.executionTimeMs}ms > ${timeoutMs}ms`,
          details: { executionTime: monitor.executionTimeMs, limit: timeoutMs },
          timestamp: new Date(),
          jobId,
        })
      }
    }

    return { violations, monitor }
  }

  /**
   * Get current resource usage for a job
   */
  private async getCurrentResourceUsage(_jobId: string): Promise<ResourceMonitor> {
    // This would integrate with actual system monitoring
    // For now, return mock data
    return {
      memoryUsageMB: Math.random() * 1000,
      cpuPercent: Math.random() * 100,
      diskUsageMB: Math.random() * 500,
      networkRequests: Math.floor(Math.random() * 50),
      executionTimeMs: Date.now(),
    }
  }

  /**
   * Generate security report for a job
   */
  generateSecurityReport(jobId: string): {
    violations: SecurityViolation[]
    resourceUsage: ResourceMonitor | null
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
    recommendations: string[]
  } {
    const violations = this.violations.filter((v) => v.jobId === jobId)
    const resourceUsage = this.resourceMonitors.get(jobId) || null

    // Calculate risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'

    if (violations.some((v) => v.severity === 'critical')) {
      riskLevel = 'critical'
    } else if (violations.some((v) => v.severity === 'high')) {
      riskLevel = 'high'
    } else if (violations.some((v) => v.severity === 'medium')) {
      riskLevel = 'medium'
    }

    // Generate recommendations
    const recommendations: string[] = []

    if (violations.length > 0) {
      recommendations.push('Review and address security violations before deployment')
    }

    if (violations.some((v) => v.type === 'command')) {
      recommendations.push('Consider using more restrictive command policies')
    }

    if (violations.some((v) => v.type === 'network')) {
      recommendations.push('Review network access policies and allowed domains')
    }

    if (resourceUsage && resourceUsage.memoryUsageMB > 2048) {
      recommendations.push('Monitor memory usage and consider optimization')
    }

    return {
      violations,
      resourceUsage,
      riskLevel,
      recommendations,
    }
  }

  /**
   * Add violation
   */
  addViolation(violation: SecurityViolation): void {
    this.violations.push(violation)
  }

  /**
   * Get all violations
   */
  getViolations(jobId?: string): SecurityViolation[] {
    if (jobId) {
      return this.violations.filter((v) => v.jobId === jobId)
    }
    return [...this.violations]
  }

  /**
   * Clear violations for a job
   */
  clearViolations(jobId: string): void {
    this.violations = this.violations.filter((v) => v.jobId !== jobId)
    this.resourceMonitors.delete(jobId)
  }

  /**
   * Create headless options with security constraints
   */
  static createSecureHeadlessOptions(environment: NikEnvironment, job: BackgroundJob): HeadlessOptions {
    const policies = environment.policies || {}

    return {
      yes: true, // Background jobs auto-approve
      noTty: true,
      jsonlLogs: true,
      cwd: '/workspace/repo',
      maxTokens: job.limits.maxToolCalls * 1000, // Estimate tokens per tool call
      timeout: job.limits.timeMin * 60 * 1000,
      allowCommands: policies.allowedCommands,
      denyCommands: policies.blockedCommands || SecurityPolicy.BLOCKED_COMMANDS,
      allowNetwork: policies.allowedDomains || SecurityPolicy.DEFAULT_ALLOWED_DOMAINS,
      safeMode: true,
    }
  }
}

// Export singleton instance
export const securityPolicy = new SecurityPolicy()
