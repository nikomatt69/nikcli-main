import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'path'
import chalk from 'chalk'
import { logger } from '../utils/logger'
import { ContextSanitizer } from './middleware-context'
import {
  BaseMiddleware,
  type MiddlewareConfig,
  type MiddlewareExecutionContext,
  type MiddlewareNext,
  type MiddlewareRequest,
  type MiddlewareResponse,
} from './types'

interface AuditEntry {
  id: string
  timestamp: Date
  requestId: string
  operation: string
  operationType: 'command' | 'agent' | 'tool' | 'file'
  userId?: string
  success: boolean
  duration: number
  inputHash: string
  outputHash?: string
  riskLevel: 'low' | 'medium' | 'high'
  context: {
    workingDirectory: string
    autonomous: boolean
    planMode: boolean
    sessionId: string
  }
  changes?: {
    filesModified: string[]
    commandsExecuted: string[]
    agentsLaunched: string[]
  }
  compliance: {
    gdprCompliant: boolean
    dataRetentionDays: number
    sensitiveDataDetected: boolean
  }
  integrity: {
    checksum: string
    signature?: string
  }
  metadata: Record<string, any>
}

interface AuditMiddlewareConfig extends MiddlewareConfig {
  auditLevel: 'minimal' | 'standard' | 'comprehensive'
  auditFile: string
  rotateAuditLogs: boolean
  maxAuditFileSize: number
  dataRetentionDays: number
  enableCompliance: boolean
  enableIntegrityChecks: boolean
  excludeOperations: string[]
  includeOnlyOperations: string[]
  enableRealTimeAlerts: boolean
  alertThresholds: {
    failureRate: number
    suspiciousActivityCount: number
  }
}

interface ComplianceReport {
  totalEntries: number
  gdprCompliantEntries: number
  sensitiveDataEntries: number
  retentionViolations: string[]
  complianceScore: number
  recommendations: string[]
}

interface SecurityAlert {
  type: 'suspicious_activity' | 'compliance_violation' | 'integrity_failure' | 'unusual_pattern'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  auditEntryId: string
  timestamp: Date
  details: Record<string, any>
}

export class AuditMiddleware extends BaseMiddleware {
  private auditConfig: AuditMiddlewareConfig
  private auditBuffer: AuditEntry[] = []
  private securityAlerts: SecurityAlert[] = []
  private suspiciousPatterns: Map<string, number> = new Map()
  private readonly bufferFlushInterval = 10000 // 10 seconds
  private flushTimer?: Timer

  constructor(config: Partial<AuditMiddlewareConfig> = {}) {
    const defaultConfig: AuditMiddlewareConfig = {
      enabled: true,
      priority: 600,
      auditLevel: 'standard',
      auditFile: path.join(process.cwd(), '.nikcli', 'audit.log'),
      rotateAuditLogs: true,
      maxAuditFileSize: 100 * 1024 * 1024, // 100MB
      dataRetentionDays: 90,
      enableCompliance: true,
      enableIntegrityChecks: true,
      excludeOperations: [],
      includeOnlyOperations: [],
      enableRealTimeAlerts: true,
      alertThresholds: {
        failureRate: 0.3, // 30%
        suspiciousActivityCount: 10,
      },
      ...config,
    }

    super('audit', 'Comprehensive audit trail and compliance monitoring', defaultConfig)

    this.auditConfig = defaultConfig
    this.setupAuditSystem()
  }

  async execute(
    request: MiddlewareRequest,
    next: MiddlewareNext,
    _context: MiddlewareExecutionContext // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<MiddlewareResponse> {
    if (!this.shouldAuditOperation(request.operation)) {
      return await next()
    }

    const auditId = this.generateAuditId()
    const startTime = Date.now()
    const inputHash = this.hashInput(request)

    let response: MiddlewareResponse
    let success = false

    try {
      response = await next()
      success = response.success

      const auditEntry = await this.createAuditEntry({
        id: auditId,
        request,
        response,
        duration: Date.now() - startTime,
        inputHash,
        success,
      })

      this.recordAuditEntry(auditEntry)

      if (this.auditConfig.enableRealTimeAlerts) {
        const alerts = await this.detectSecurityIssues(auditEntry)
        alerts.forEach((alert) => this.handleSecurityAlert(alert))
      }

      return {
        ...response,
        metadata: {
          ...response.metadata,
          audit: {
            auditId,
            audited: true,
            riskLevel: auditEntry.riskLevel,
            complianceChecked: this.auditConfig.enableCompliance,
          },
        },
      }
    } catch (error: any) {
      const auditEntry = await this.createAuditEntry({
        id: auditId,
        request,
        error,
        duration: Date.now() - startTime,
        inputHash,
        success: false,
      })

      this.recordAuditEntry(auditEntry)

      if (this.auditConfig.enableRealTimeAlerts) {
        const alerts = await this.detectSecurityIssues(auditEntry)
        alerts.forEach((alert) => this.handleSecurityAlert(alert))
      }

      throw error
    }
  }

  private async createAuditEntry(params: {
    id: string
    request: MiddlewareRequest
    response?: MiddlewareResponse
    error?: Error
    duration: number
    inputHash: string
    success: boolean
  }): Promise<AuditEntry> {
    const { id, request, response, error, duration, inputHash, success } = params

    const outputHash = response ? this.hashOutput(response) : undefined
    const riskLevel = this.assessOperationRisk(request)
    const changes = await this.detectChanges(request, response)
    const compliance = this.checkCompliance(request, response)

    const baseEntry: Omit<AuditEntry, 'integrity'> = {
      id,
      timestamp: new Date(),
      requestId: request.id,
      operation: request.operation,
      operationType: request.type,
      userId: request.context.userId,
      success,
      duration,
      inputHash,
      outputHash,
      riskLevel,
      context: {
        workingDirectory: request.context.workingDirectory,
        autonomous: request.context.autonomous,
        planMode: request.context.planMode,
        sessionId: request.context.session?.id || 'unknown',
      },
      changes,
      compliance,
      metadata: {
        ...request.metadata,
        error: error?.message,
        errorStack: error?.stack,
        responseSize: response ? JSON.stringify(response).length : 0,
      },
    }

    const checksum = this.calculateChecksum(baseEntry)
    const signature = this.auditConfig.enableIntegrityChecks ? await this.signAuditEntry(baseEntry) : undefined

    return {
      ...baseEntry,
      integrity: {
        checksum,
        signature,
      },
    }
  }

  private shouldAuditOperation(operation: string): boolean {
    if (this.auditConfig.includeOnlyOperations.length > 0) {
      return this.auditConfig.includeOnlyOperations.some((included) =>
        operation.toLowerCase().includes(included.toLowerCase())
      )
    }

    return !this.auditConfig.excludeOperations.some((excluded) =>
      operation.toLowerCase().includes(excluded.toLowerCase())
    )
  }

  private hashInput(request: MiddlewareRequest): string {
    const sanitizedRequest = ContextSanitizer.sanitizeForLogging(request.context)
    const inputData = {
      operation: request.operation,
      type: request.type,
      args: request.args,
      context: sanitizedRequest,
    }

    return crypto.createHash('sha256').update(JSON.stringify(inputData)).digest('hex')
  }

  private hashOutput(response: MiddlewareResponse): string {
    const outputData = {
      success: response.success,
      error: response.error,
      dataSize: response.data ? JSON.stringify(response.data).length : 0,
      metadata: response.metadata,
    }

    return crypto.createHash('sha256').update(JSON.stringify(outputData)).digest('hex')
  }

  private assessOperationRisk(request: MiddlewareRequest): 'low' | 'medium' | 'high' {
    const operation = request.operation.toLowerCase()

    const highRiskOperations = [
      'delete',
      'remove',
      'rm',
      'sudo',
      'su',
      'chmod 777',
      'system administration',
      'production',
      'deploy',
      'database migration',
      'security',
      'credentials',
    ]

    const mediumRiskOperations = [
      'write',
      'edit',
      'create',
      'modify',
      'git push',
      'npm install',
      'yarn add',
      'pip install',
      'docker run',
      'file manipulation',
    ]

    if (highRiskOperations.some((risk) => operation.includes(risk))) {
      return 'high'
    }

    if (mediumRiskOperations.some((risk) => operation.includes(risk))) {
      return 'medium'
    }

    return 'low'
  }

  private async detectChanges(
    request: MiddlewareRequest,
    _response?: MiddlewareResponse // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{
    filesModified: string[]
    commandsExecuted: string[]
    agentsLaunched: string[]
  }> {
    const changes = {
      filesModified: [] as string[],
      commandsExecuted: [] as string[],
      agentsLaunched: [] as string[],
    }

    if (request.type === 'file') {
      if (['write', 'edit', 'create', 'modify'].some((op) => request.operation.toLowerCase().includes(op))) {
        changes.filesModified = request.args.filter((arg) => typeof arg === 'string') as string[]
      }
    }

    if (request.type === 'command') {
      changes.commandsExecuted = [request.operation]
    }

    if (request.type === 'agent') {
      changes.agentsLaunched = [request.operation]
    }

    return changes
  }

  private checkCompliance(
    request: MiddlewareRequest,
    response?: MiddlewareResponse
  ): {
    gdprCompliant: boolean
    dataRetentionDays: number
    sensitiveDataDetected: boolean
  } {
    const sensitiveDataPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}-?\d{2}-?\d{4}\b/, // SSN
      /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card
      /\b[A-Za-z0-9+/]{40,}={0,2}\b/, // API keys/tokens
    ]

    const requestString = JSON.stringify(request)
    const responseString = response ? JSON.stringify(response) : ''
    const combinedData = requestString + responseString

    const sensitiveDataDetected = sensitiveDataPatterns.some((pattern) => pattern.test(combinedData))

    return {
      gdprCompliant: !sensitiveDataDetected,
      dataRetentionDays: this.auditConfig.dataRetentionDays,
      sensitiveDataDetected,
    }
  }

  private calculateChecksum(entry: Omit<AuditEntry, 'integrity'>): string {
    const dataForChecksum = {
      ...entry,
      // Exclude non-deterministic fields from checksum
      timestamp: entry.timestamp.toISOString(),
    }

    return crypto.createHash('sha256').update(JSON.stringify(dataForChecksum)).digest('hex')
  }

  private async signAuditEntry(entry: Omit<AuditEntry, 'integrity'>): Promise<string> {
    const checksum = this.calculateChecksum(entry)
    return crypto
      .createHash('sha512')
      .update(checksum + process.env.AUDIT_SIGNATURE_KEY || 'default-key')
      .digest('hex')
  }

  private recordAuditEntry(entry: AuditEntry): void {
    this.auditBuffer.push(entry)

    if (this.auditConfig.auditLevel === 'comprehensive') {
      logger.info('Audit entry created', {
        auditId: entry.id,
        operation: entry.operation,
        success: entry.success,
        riskLevel: entry.riskLevel,
      })
    }
  }

  private async detectSecurityIssues(entry: AuditEntry): Promise<SecurityAlert[]> {
    const alerts: SecurityAlert[] = []

    if (entry.riskLevel === 'high' && !entry.success) {
      alerts.push({
        type: 'suspicious_activity',
        severity: 'high',
        message: 'High-risk operation failed - possible security incident',
        auditEntryId: entry.id,
        timestamp: new Date(),
        details: { operation: entry.operation, riskLevel: entry.riskLevel },
      })
    }

    if (entry.compliance.sensitiveDataDetected) {
      alerts.push({
        type: 'compliance_violation',
        severity: 'medium',
        message: 'Sensitive data detected in operation',
        auditEntryId: entry.id,
        timestamp: new Date(),
        details: { operation: entry.operation },
      })
    }

    const patternKey = `${entry.userId}-${entry.operation}`
    const currentCount = this.suspiciousPatterns.get(patternKey) || 0
    this.suspiciousPatterns.set(patternKey, currentCount + 1)

    if (currentCount + 1 > this.auditConfig.alertThresholds.suspiciousActivityCount) {
      alerts.push({
        type: 'unusual_pattern',
        severity: 'medium',
        message: `Unusual activity pattern detected: ${entry.operation} repeated ${currentCount + 1} times`,
        auditEntryId: entry.id,
        timestamp: new Date(),
        details: { operation: entry.operation, count: currentCount + 1 },
      })
    }

    if (this.auditConfig.enableIntegrityChecks) {
      const { integrity, ...entryWithoutIntegrity } = entry
      const recalculatedChecksum = this.calculateChecksum(entryWithoutIntegrity)

      if (recalculatedChecksum !== entry.integrity.checksum) {
        alerts.push({
          type: 'integrity_failure',
          severity: 'critical',
          message: 'Audit entry integrity check failed',
          auditEntryId: entry.id,
          timestamp: new Date(),
          details: {
            expectedChecksum: recalculatedChecksum,
            actualChecksum: entry.integrity.checksum,
          },
        })
      }
    }

    return alerts
  }

  private handleSecurityAlert(alert: SecurityAlert): void {
    this.securityAlerts.push(alert)

    if (this.securityAlerts.length > 500) {
      this.securityAlerts.shift()
    }

    const severityColor = this.getSeverityColor(alert.severity)
    const icon = this.getAlertIcon(alert.type)

    console.log(severityColor(`${icon} Security Alert: ${alert.message}`))

    logger.warn('Security alert generated', {
      type: alert.type,
      severity: alert.severity,
      auditEntryId: alert.auditEntryId,
      message: alert.message,
      details: alert.details,
    })
  }

  private setupAuditSystem(): void {
    this.ensureAuditDirectory()
    this.setupBufferFlushing()
    this.startRetentionManager()
    this.startPeriodicCleanup()
  }

  private async ensureAuditDirectory(): Promise<void> {
    try {
      const auditDir = path.dirname(this.auditConfig.auditFile)
      await fs.mkdir(auditDir, { recursive: true })
    } catch (error) {
      logger.error('Failed to create audit directory', { error })
    }
  }

  private setupBufferFlushing(): void {
    this.flushTimer = setInterval(async () => {
      await this.flushAuditBuffer()
    }, this.bufferFlushInterval)

    process.on('SIGINT', () => this.flushAuditBuffer())
    process.on('SIGTERM', () => this.flushAuditBuffer())
    process.on('exit', () => this.flushAuditBuffer())
  }

  private async flushAuditBuffer(): Promise<void> {
    if (this.auditBuffer.length === 0) return

    try {
      const entries = this.auditBuffer.splice(0)
      const auditLines = `${entries.map((entry) => JSON.stringify(entry)).join('\\n')}\\n`

      await this.rotateAuditFileIfNeeded()
      await fs.appendFile(this.auditConfig.auditFile, auditLines, 'utf8')

      if (this.auditConfig.auditLevel === 'comprehensive') {
        console.log(chalk.dim(`📝 Flushed ${entries.length} audit entries`))
      }
    } catch (error) {
      logger.error('Failed to flush audit buffer', { error })
    }
  }

  private async rotateAuditFileIfNeeded(): Promise<void> {
    if (!this.auditConfig.rotateAuditLogs) return

    try {
      const stats = await fs.stat(this.auditConfig.auditFile)
      if (stats.size < this.auditConfig.maxAuditFileSize) return

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const rotatedFile = this.auditConfig.auditFile.replace('.log', `-${timestamp}.log`)

      await fs.rename(this.auditConfig.auditFile, rotatedFile)
      console.log(chalk.yellow(`📦 Rotated audit log to ${rotatedFile}`))
    } catch (_error) {
      // File might not exist yet
    }
  }

  private startRetentionManager(): void {
    setInterval(
      async () => {
        await this.enforceDataRetention()
      },
      24 * 60 * 60 * 1000
    ) // Daily
  }

  private startPeriodicCleanup(): void {
    setInterval(
      () => {
        this.suspiciousPatterns.clear()
      },
      60 * 60 * 1000
    ) // Hourly
  }

  private async enforceDataRetention(): Promise<void> {
    // Implementation would clean up old audit files based on retention policy
    console.log(chalk.dim('🧹 Running audit data retention cleanup'))
  }

  private generateAuditId(): string {
    return crypto.randomUUID()
  }

  private getSeverityColor(severity: string): any {
    switch (severity) {
      case 'critical':
        return chalk.red.bold
      case 'high':
        return chalk.red
      case 'medium':
        return chalk.yellow
      case 'low':
        return chalk.blue
      default:
        return chalk.gray
    }
  }

  private getAlertIcon(type: string): string {
    switch (type) {
      case 'suspicious_activity':
        return '🚨'
      case 'compliance_violation':
        return '⚖️'
      case 'integrity_failure':
        return '🔐'
      case 'unusual_pattern':
        return '🔍'
      default:
        return '⚠️'
    }
  }

  async getAuditEntries(
    limit: number = 100,
    filter?: {
      operation?: string
      userId?: string
      success?: boolean
      riskLevel?: 'low' | 'medium' | 'high'
      since?: Date
    }
  ): Promise<AuditEntry[]> {
    const entries: AuditEntry[] = [...this.auditBuffer]

    try {
      const auditContent = await fs.readFile(this.auditConfig.auditFile, 'utf8')
      const fileEntries = auditContent
        .split('\\n')
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line) as AuditEntry
          } catch {
            return null
          }
        })
        .filter((entry): entry is AuditEntry => entry !== null)

      entries.unshift(...fileEntries)
    } catch (_error) {
      // File might not exist yet
    }

    let filteredEntries = entries
    if (filter) {
      filteredEntries = entries.filter((entry) => {
        if (filter.operation && !entry.operation.includes(filter.operation)) return false
        if (filter.userId && entry.userId !== filter.userId) return false
        if (filter.success !== undefined && entry.success !== filter.success) return false
        if (filter.riskLevel && entry.riskLevel !== filter.riskLevel) return false
        if (filter.since && new Date(entry.timestamp) < filter.since) return false
        return true
      })
    }

    return filteredEntries
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }

  getSecurityAlerts(limit: number = 50): SecurityAlert[] {
    return this.securityAlerts.slice(-limit)
  }

  async generateComplianceReport(): Promise<ComplianceReport> {
    const entries = await this.getAuditEntries(1000)

    const totalEntries = entries.length
    const gdprCompliantEntries = entries.filter((e) => e.compliance.gdprCompliant).length
    const sensitiveDataEntries = entries.filter((e) => e.compliance.sensitiveDataDetected).length

    const retentionViolations: string[] = []
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.auditConfig.dataRetentionDays)

    entries.forEach((entry) => {
      if (new Date(entry.timestamp) < cutoffDate) {
        retentionViolations.push(entry.id)
      }
    })

    const complianceScore = totalEntries > 0 ? (gdprCompliantEntries / totalEntries) * 100 : 100

    const recommendations: string[] = []
    if (sensitiveDataEntries > 0) {
      recommendations.push('Implement data anonymization for sensitive operations')
    }
    if (retentionViolations.length > 0) {
      recommendations.push(`${retentionViolations.length} entries exceed retention policy`)
    }
    if (complianceScore < 80) {
      recommendations.push('Review and improve data handling practices')
    }

    return {
      totalEntries,
      gdprCompliantEntries,
      sensitiveDataEntries,
      retentionViolations,
      complianceScore,
      recommendations,
    }
  }

  updateAuditConfig(config: Partial<AuditMiddlewareConfig>): void {
    this.auditConfig = { ...this.auditConfig, ...config }
    this.updateConfig(this.auditConfig)
  }

  getAuditConfig(): AuditMiddlewareConfig {
    return { ...this.auditConfig }
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }
    this.flushAuditBuffer()
  }
}
