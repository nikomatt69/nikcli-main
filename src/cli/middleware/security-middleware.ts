import chalk from 'chalk';
import {
  BaseMiddleware,
  MiddlewareRequest,
  MiddlewareResponse,
  MiddlewareNext,
  MiddlewareExecutionContext,
  MiddlewareConfig
} from './types';
import { ExecutionPolicyManager } from '../policies/execution-policy';
import { logger } from '../utils/logger';

interface SecurityMiddlewareConfig extends MiddlewareConfig {
  strictMode: boolean;
  allowedOperations: string[];
  blockedOperations: string[];
  riskThreshold: 'low' | 'medium' | 'high';
  requireApproval: boolean;
  logSecurityEvents: boolean;
}

export class SecurityMiddleware extends BaseMiddleware {
  private policyManager: ExecutionPolicyManager;
  private securityConfig: SecurityMiddlewareConfig;
  private securityEvents: Array<{
    timestamp: Date;
    operation: string;
    riskLevel: string;
    action: string;
    reason: string;
  }> = [];

  constructor(
    policyManager: ExecutionPolicyManager,
    config: Partial<SecurityMiddlewareConfig> = {}
  ) {
    const defaultConfig: SecurityMiddlewareConfig = {
      enabled: true,
      priority: 1000, // Highest priority
      strictMode: false,
      allowedOperations: [],
      blockedOperations: ['rm -rf', 'sudo', 'su', 'chmod 777', 'dd', 'mkfs'],
      riskThreshold: 'medium',
      requireApproval: true,
      logSecurityEvents: true,
      ...config
    };

    super('security', 'Security validation and access control', defaultConfig);

    this.policyManager = policyManager;
    this.securityConfig = defaultConfig;
  }

  async execute(
    request: MiddlewareRequest,
    next: MiddlewareNext,
    context: MiddlewareExecutionContext // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<MiddlewareResponse> {
    const securityCheck = await this.performSecurityCheck(request);

    if (!securityCheck.allowed) {
      this.logSecurityEvent(request.operation, 'high', 'blocked', securityCheck.reason);

      return {
        success: false,
        error: `Security violation: ${securityCheck.reason}`,
        metadata: {
          securityViolation: true,
          reason: securityCheck.reason,
          riskLevel: securityCheck.riskLevel
        }
      };
    }

    if (securityCheck.requiresApproval && this.securityConfig.requireApproval) {
      const approved = await this.requestApproval(request, securityCheck);

      if (!approved) {
        this.logSecurityEvent(request.operation, securityCheck.riskLevel, 'denied', 'User denied approval');

        return {
          success: false,
          error: 'Operation denied by user',
          metadata: {
            userDenied: true,
            riskLevel: securityCheck.riskLevel
          }
        };
      }
    }

    this.logSecurityEvent(request.operation, securityCheck.riskLevel, 'allowed', securityCheck.reason);

    const startTime = Date.now();
    const response = await next();
    const duration = Date.now() - startTime;

    const sanitizedResponse = this.sanitizeResponse(response);

    return {
      ...sanitizedResponse,
      metadata: {
        ...sanitizedResponse.metadata,
        security: {
          validated: true,
          riskLevel: securityCheck.riskLevel,
          executionTime: duration,
          policyApplied: true
        }
      }
    };
  }

  private async performSecurityCheck(request: MiddlewareRequest): Promise<{
    allowed: boolean;
    requiresApproval: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    reason: string;
  }> {
    const operation = request.operation.toLowerCase();

    if (this.securityConfig.blockedOperations.some(blocked =>
      operation.includes(blocked.toLowerCase())
    )) {
      return {
        allowed: false,
        requiresApproval: false,
        riskLevel: 'high',
        reason: 'Operation contains blocked command'
      };
    }

    if (this.securityConfig.allowedOperations.length > 0 &&
      !this.securityConfig.allowedOperations.some(allowed =>
        operation.includes(allowed.toLowerCase())
      )) {
      return {
        allowed: this.securityConfig.strictMode ? false : true,
        requiresApproval: true,
        riskLevel: 'medium',
        reason: 'Operation not in allowed list'
      };
    }

    if (request.type === 'command') {
      const shouldAskApproval = await this.policyManager.shouldAskForApproval(request.operation);
      const riskLevel = this.assessCommandRisk(request.operation);

      return {
        allowed: true,
        requiresApproval: shouldAskApproval,
        riskLevel,
        reason: 'Command security check passed'
      };
    }

    if (request.type === 'file') {
      const canWrite = await this.policyManager.allowWorkspaceWrite();
      const riskLevel = this.assessFileOperationRisk(request);

      if (!canWrite && this.isWriteOperation(request)) {
        return {
          allowed: false,
          requiresApproval: false,
          riskLevel: 'high',
          reason: 'File write operations not allowed by policy'
        };
      }

      return {
        allowed: true,
        requiresApproval: riskLevel === 'high',
        riskLevel,
        reason: 'File operation security check passed'
      };
    }

    if (request.type === 'agent') {
      const riskLevel = this.assessAgentTaskRisk(request);

      return {
        allowed: true,
        requiresApproval: riskLevel === 'high',
        riskLevel,
        reason: 'Agent task security check passed'
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
      riskLevel: 'low',
      reason: 'Default security check passed'
    };
  }

  private assessCommandRisk(command: string): 'low' | 'medium' | 'high' {
    const highRiskPatterns = [
      /rm\s+(-rf?|--recursive)/i,
      /sudo/i,
      /su\s/i,
      /chmod\s+777/i,
      /docker\s+run.*--privileged/i,
      /npm\s+(install|i)\s+-g/i,
      /curl.*\|\s*(bash|sh)/i
    ];

    const mediumRiskPatterns = [
      /git\s+(push|reset|rebase)/i,
      /docker/i,
      /npm\s+(install|i)/i,
      /yarn\s+add/i,
      /pip\s+install/i
    ];

    if (highRiskPatterns.some(pattern => pattern.test(command))) {
      return 'high';
    }

    if (mediumRiskPatterns.some(pattern => pattern.test(command))) {
      return 'medium';
    }

    return 'low';
  }

  private assessFileOperationRisk(request: MiddlewareRequest): 'low' | 'medium' | 'high' {
    const args = request.args;
    if (!args || args.length === 0) return 'low';

    const filePath = String(args[0] || '').toLowerCase();

    const highRiskFiles = [
      '/etc/', '/usr/', '/var/', '/bin/', '/sbin/',
      'package.json', 'package-lock.json', 'yarn.lock',
      '.env', '.git/', 'dockerfile', 'docker-compose'
    ];

    const mediumRiskFiles = [
      '.js', '.ts', '.py', '.sh', '.bash', '.zsh'
    ];

    if (highRiskFiles.some(risk => filePath.includes(risk))) {
      return 'high';
    }

    if (mediumRiskFiles.some(risk => filePath.endsWith(risk))) {
      return 'medium';
    }

    return 'low';
  }

  private assessAgentTaskRisk(request: MiddlewareRequest): 'low' | 'medium' | 'high' {
    const operation = request.operation.toLowerCase();

    const highRiskOperations = [
      'system administration', 'deploy', 'production', 'database migration',
      'security', 'credentials', 'authentication', 'authorization'
    ];

    const mediumRiskOperations = [
      'file manipulation', 'git operations', 'package management',
      'code generation', 'refactoring'
    ];

    if (highRiskOperations.some(risk => operation.includes(risk))) {
      return 'high';
    }

    if (mediumRiskOperations.some(risk => operation.includes(risk))) {
      return 'medium';
    }

    return 'low';
  }

  private isWriteOperation(request: MiddlewareRequest): boolean {
    const operation = request.operation.toLowerCase();
    const writeOperations = ['write', 'edit', 'create', 'update', 'delete', 'modify'];
    return writeOperations.some(op => operation.includes(op));
  }

  private async requestApproval(
    request: MiddlewareRequest,
    securityCheck: { riskLevel: string; reason: string }
  ): Promise<boolean> {
    console.log(chalk.yellow.bold('\\n⚠️  Security Approval Required'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.blue('Operation:')} ${request.operation}`);
    console.log(`${chalk.blue('Risk Level:')} ${this.formatRiskLevel(securityCheck.riskLevel)}`);
    console.log(`${chalk.blue('Reason:')} ${securityCheck.reason}`);
    console.log(`${chalk.blue('Request ID:')} ${request.id}`);

    if (request.args && request.args.length > 0) {
      console.log(`${chalk.blue('Arguments:')}`);
      request.args.slice(0, 3).forEach((arg, i) => {
        console.log(`  ${i + 1}. ${String(arg).slice(0, 100)}`);
      });
      if (request.args.length > 3) {
        console.log(`  ... and ${request.args.length - 3} more`);
      }
    }

    return new Promise((resolve) => {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(chalk.yellow('\\nApprove this operation? (y/N): '), (answer: string) => {
        rl.close();
        const approved = answer.toLowerCase().startsWith('y');

        if (approved) {
          console.log(chalk.green('✅ Operation approved'));
        } else {
          console.log(chalk.red('❌ Operation denied'));
        }

        resolve(approved);
      });
    });
  }

  private formatRiskLevel(level: string): string {
    switch (level) {
      case 'high': return chalk.red('HIGH');
      case 'medium': return chalk.yellow('MEDIUM');
      case 'low': return chalk.green('LOW');
      default: return level.toUpperCase();
    }
  }

  private sanitizeResponse(response: MiddlewareResponse): MiddlewareResponse {
    if (!response.data) return response;

    const sanitized = { ...response };

    if (typeof response.data === 'object') {
      sanitized.data = this.sanitizeObject(response.data);
    } else if (typeof response.data === 'string') {
      sanitized.data = this.sanitizeString(response.data);
    }

    return sanitized;
  }

  private sanitizeObject(obj: any): any {
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'credential'];

    if (typeof obj !== 'object' || obj === null) return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private sanitizeString(str: string): string {
    const patterns = [
      /([A-Za-z0-9+/]{40,}={0,2})/g, // Base64 tokens
      /(sk-[A-Za-z0-9]{20,})/g, // API keys
      /(ghp_[A-Za-z0-9]{36})/g, // GitHub tokens
      /([A-Fa-f0-9]{32})/g, // MD5 hashes
      /([A-Fa-f0-9]{40})/g, // SHA1 hashes
    ];

    let sanitized = str;
    patterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    return sanitized;
  }

  private logSecurityEvent(
    operation: string,
    riskLevel: string,
    action: string,
    reason: string
  ): void {
    const event = {
      timestamp: new Date(),
      operation,
      riskLevel,
      action,
      reason
    };

    this.securityEvents.push(event);

    if (this.securityEvents.length > 1000) {
      this.securityEvents.shift();
    }

    if (this.securityConfig.logSecurityEvents) {
      logger.info('Security event', event);
    }
  }

  getSecurityEvents(limit: number = 100): Array<{
    timestamp: Date;
    operation: string;
    riskLevel: string;
    action: string;
    reason: string;
  }> {
    return this.securityEvents.slice(-limit);
  }

  clearSecurityEvents(): void {
    this.securityEvents.length = 0;
  }

  updateSecurityConfig(config: Partial<SecurityMiddlewareConfig>): void {
    this.securityConfig = { ...this.securityConfig, ...config };
    this.updateConfig(this.securityConfig);
  }

  getSecurityConfig(): SecurityMiddlewareConfig {
    return { ...this.securityConfig };
  }
}