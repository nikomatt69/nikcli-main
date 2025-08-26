import chalk from 'chalk';
import inquirer from 'inquirer';
import boxen from 'boxen';
import { DiffViewer, FileDiff } from './diff-viewer';
import { inputQueue } from '../core/input-queue';
import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

// Enterprise User Management
export interface EnterpriseUser {
  id: string;
  username: string;
  role: UserRole;
  department: string;
  permissions: string[];
  delegations?: Delegation[];
  preferences?: UserPreferences;
}

export interface UserRole {
  name: string;
  level: number; // Higher = more permissions
  maxRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  capabilities: string[];
}

export interface Delegation {
  id: string;
  fromUser: string;
  toUser: string;
  validUntil: Date;
  scope: string[];
  active: boolean;
}

export interface UserPreferences {
  autoApproveRules: AutoApprovalRule[];
  notificationSettings: {
    email: boolean;
    inApp: boolean;
    urgentOnly: boolean;
  };
  workflowPreferences: {
    batchSize: number;
    defaultTimeout: number;
    requireReview: boolean;
  };
}

export interface AutoApprovalRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  maxRisk: 'low' | 'medium' | 'high';
  active: boolean;
}

export interface RuleCondition {
  field: string;
  operator: string;
  value: any;
}

// Enhanced Approval Request with Enterprise Features
export interface ApprovalRequest {
  id: string;
  title: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  actions: ApprovalAction[];
  context?: {
    workingDirectory?: string;
    affectedFiles?: string[];
    estimatedDuration?: number;
    planDetails?: {
      totalSteps?: number;
      categories?: string[];
      priorities?: string[];
      dependencies?: number;
    };
  };
  timeout?: number; // milliseconds
  type?: 'general' | 'plan' | 'file' | 'command' | 'package';

  // Enterprise Features
  requesterId?: string;
  requesterInfo?: {
    username: string;
    department: string;
    role: string;
  };
  riskAssessment?: RiskAssessment;
  workflow?: ApprovalWorkflow;
  compliance?: ComplianceInfo;
  businessJustification?: string;
  urgency?: 'low' | 'medium' | 'high' | 'emergency';
  estimatedCost?: number;
  relatedRequests?: string[];
  auditTrail?: AuditEntry[];
}

export interface RiskAssessment {
  overallScore: number; // 0-100
  factors: RiskFactor[];
  mitigations: string[];
  recommendations: string[];
  automaticFlags: SecurityFlag[];
}

export interface RiskFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
  category: 'security' | 'operations' | 'compliance' | 'business';
}

export interface SecurityFlag {
  type: 'potential_threat' | 'policy_violation' | 'anomaly';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  recommendation: string;
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  currentStep: number;
  escalationRules: EscalationRule[];
  parallel: boolean;
}

export interface WorkflowStep {
  order: number;
  name: string;
  type: 'approval' | 'review' | 'notification';
  approvers: string[];
  timeout: number;
  optional: boolean;
}

export interface EscalationRule {
  trigger: 'timeout' | 'rejection';
  delay: number;
  action: 'notify' | 'escalate' | 'auto_approve';
  target: string;
}

export interface ComplianceInfo {
  frameworks: string[];
  requirements: string[];
  auditTrail: AuditEntry[];
  retentionPeriod: number;
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
}

export interface AuditEntry {
  timestamp: Date;
  actor: string;
  action: string;
  details: any;
  ipAddress?: string;
  sessionId?: string;
}

export interface ApprovalAction {
  type: 'file_create' | 'file_modify' | 'file_delete' | 'command_execute' | 'package_install' | 'network_request';
  description: string;
  details: any;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ApprovalResponse {
  approved: boolean;
  modifiedActions?: string[]; // IDs of actions to skip
  userComments?: string;
  timestamp: Date;

  // Enterprise Features
  approver?: string;
  delegatedBy?: string;
  conditions?: ApprovalCondition[];
  riskAcceptance?: RiskAcceptance;
  complianceConfirmation?: ComplianceConfirmation;
  expiresAt?: Date;
  auditTrail?: AuditEntry[];
  processingTime?: number;
  workflowId?: string;
  escalationLevel?: number;
}

export interface ApprovalCondition {
  type: 'restriction' | 'requirement' | 'monitoring';
  description: string;
  enforced: boolean;
  validUntil?: Date;
}

export interface RiskAcceptance {
  acceptedRisks: string[];
  mitigationPlan: string[];
  reviewRequired: boolean;
  reviewDate?: Date;
}

export interface ComplianceConfirmation {
  frameworks: string[];
  requirements: string[];
  attestations: string[];
  exceptions?: string[];
}

export interface ApprovalConfig {
  autoApprove?: {
    lowRisk?: boolean;
    mediumRisk?: boolean;
    fileOperations?: boolean;
    packageInstalls?: boolean;
    planExecution?: boolean;
  };
  requireConfirmation?: {
    destructiveOperations?: boolean;
    networkRequests?: boolean;
    systemCommands?: boolean;
    planModifications?: boolean;
  };
  timeout?: number; // Default timeout in milliseconds
  planApproval?: {
    showDetailedBreakdown?: boolean;
    allowStepModification?: boolean;
    showRiskAnalysis?: boolean;
    showTimeline?: boolean;
  };

  // Enterprise Features
  enterpriseMode?: boolean;
  roleBasedAccess?: boolean;
  auditLevel?: 'basic' | 'detailed' | 'full';
  workflowEngine?: boolean;
  riskAssessment?: boolean;
  complianceValidation?: boolean;
  delegation?: boolean;
  batchProcessing?: boolean;
  integrations?: IntegrationConfig[];
  securitySettings?: EnterpriseSecuritySettings;
  defaultTimeouts?: TimeoutConfig;
  escalationSettings?: EscalationSettings;
}

export interface IntegrationConfig {
  type: 'external_approver' | 'notification' | 'audit_system';
  endpoint: string;
  enabled: boolean;
}

export interface EnterpriseSecuritySettings {
  mfaRequired?: boolean;
  encryptionLevel?: 'standard' | 'high' | 'maximum';
  auditRetention?: number;
  ipWhitelisting?: boolean;
  sessionManagement?: boolean;
}

export interface TimeoutConfig {
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
  criticalRisk: number;
}

export interface EscalationSettings {
  enabled: boolean;
  defaultDelay: number;
  maxEscalations: number;
  notificationMethods: string[];
}

export class ApprovalSystem extends EventEmitter {
  private config: ApprovalConfig;
  private pendingRequests: Map<string, ApprovalRequest> = new Map();

  // Enterprise Features
  private users: Map<string, EnterpriseUser> = new Map();
  private auditLog: AuditEntry[] = [];
  private activeWorkflows: Map<string, ApprovalWorkflow> = new Map();
  private riskEngine: RiskEngine;
  private complianceEngine: ComplianceEngine;
  private workflowEngine: WorkflowEngine;
  private sessionId: string;

  constructor(config: ApprovalConfig = {}) {
    super();

    this.config = {
      autoApprove: {
        lowRisk: true,
        mediumRisk: true,
        fileOperations: true,
        packageInstalls: false,
        planExecution: true,
      },
      requireConfirmation: {
        destructiveOperations: true,
        networkRequests: true,
        systemCommands: true,
      },
      timeout: 60000, // 1 minute default

      // Enterprise defaults (disabled for normal CLI use)
      enterpriseMode: false,
      roleBasedAccess: false,
      auditLevel: 'basic',
      workflowEngine: false,
      riskAssessment: false,
      complianceValidation: false,
      delegation: true,
      batchProcessing: true,
      defaultTimeouts: {
        lowRisk: 300000,    // 5 minutes
        mediumRisk: 900000, // 15 minutes
        highRisk: 1800000,  // 30 minutes
        criticalRisk: 3600000 // 1 hour
      },
      escalationSettings: {
        enabled: true,
        defaultDelay: 600000, // 10 minutes
        maxEscalations: 3,
        notificationMethods: ['console', 'log']
      },

      ...config,
    };

    // Initialize enterprise components
    this.sessionId = randomBytes(16).toString('hex');
    this.riskEngine = new RiskEngine();
    this.complianceEngine = new ComplianceEngine();
    this.workflowEngine = new WorkflowEngine();

    // Initialize default users and roles
    this.initializeDefaultUsers();

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Initialize default users and roles
   */
  private initializeDefaultUsers(): void {
    // Default enterprise roles
    const adminRole: UserRole = {
      name: 'Enterprise Admin',
      level: 100,
      maxRiskLevel: 'critical',
      capabilities: ['approve_all', 'manage_users', 'configure_system']
    };

    const managerRole: UserRole = {
      name: 'Department Manager',
      level: 80,
      maxRiskLevel: 'high',
      capabilities: ['approve_high_risk', 'delegate_approvals']
    };

    const developerRole: UserRole = {
      name: 'Senior Developer',
      level: 60,
      maxRiskLevel: 'medium',
      capabilities: ['approve_medium_risk', 'review_code']
    };

    // Default system user
    const systemUser: EnterpriseUser = {
      id: 'system',
      username: 'system',
      role: adminRole,
      department: 'IT',
      permissions: ['*'],
      preferences: {
        autoApproveRules: [{
          id: 'low-risk-auto',
          name: 'Auto-approve low risk operations',
          conditions: [{ field: 'riskLevel', operator: 'equals', value: 'low' }],
          maxRisk: 'low',
          active: true
        }],
        notificationSettings: {
          email: false,
          inApp: true,
          urgentOnly: false
        },
        workflowPreferences: {
          batchSize: 10,
          defaultTimeout: 300000,
          requireReview: false
        }
      }
    };

    this.users.set('system', systemUser);
  }

  /**
   * Setup enterprise event handlers
   */
  private setupEventHandlers(): void {
    this.on('request:submitted', this.handleRequestSubmitted.bind(this));
    this.on('request:approved', this.handleRequestApproved.bind(this));
    this.on('request:rejected', this.handleRequestRejected.bind(this));
    this.on('workflow:escalated', this.handleWorkflowEscalated.bind(this));
    this.on('compliance:violation', this.handleComplianceViolation.bind(this));
  }

  /**
   * Enhanced request approval with enterprise features
   */
  async requestEnterpriseApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    const startTime = Date.now();

    // Add enterprise fields if not present
    if (!request.requesterId) request.requesterId = 'system';
    if (!request.requesterInfo) {
      request.requesterInfo = {
        username: 'system',
        department: 'Development',
        role: 'system'
      };
    }

    // Auto-add business justification for system requests if needed
    if (request.riskLevel === 'critical' && !request.businessJustification && request.requesterId === 'system') {
      request.businessJustification = 'Automated system operation - CLI plan execution';
    }

    // Log audit entry
    this.logAuditEntry({
      timestamp: new Date(),
      actor: request.requesterId,
      action: 'approval_requested',
      details: { requestId: request.id, type: request.type, riskLevel: request.riskLevel },
      sessionId: this.sessionId
    });

    // Perform enterprise risk assessment
    if (this.config.riskAssessment) {
      request.riskAssessment = await this.riskEngine.assessRisk(request);
    }

    // Validate compliance
    if (this.config.complianceValidation) {
      const complianceValidation = await this.complianceEngine.validateCompliance(request);
      if (!complianceValidation.passed) {
        throw new Error(`Compliance validation failed: ${complianceValidation.violations.join(', ')}`);
      }
    }

    // Check enterprise auto-approval rules
    const autoApprovalResult = await this.checkEnterpriseAutoApproval(request);
    if (autoApprovalResult.approved) {
      return this.createAutoApprovalResponse(request, autoApprovalResult, startTime);
    }

    // Create and execute workflow
    if (this.config.workflowEngine) {
      request.workflow = await this.workflowEngine.createWorkflow(request);
      this.activeWorkflows.set(request.id, request.workflow);
    }

    // Store request
    this.pendingRequests.set(request.id, request);

    // Emit event
    this.emit('request:submitted', request);

    // Execute workflow
    return await this.executeEnterpriseWorkflow(request, startTime);
  }

  /**
   * Request approval for a set of actions
   */
  async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    // Use enterprise approval if enterprise mode is enabled
    if (this.config.enterpriseMode) {
      return await this.requestEnterpriseApproval(request);
    }

    // Original approval logic for backward compatibility
    this.pendingRequests.set(request.id, request);

    try {
      // Check if auto-approval is enabled for this type
      if (this.shouldAutoApprove(request)) {
        console.log(chalk.green(`✓ Auto-approved: ${request.title} (${request.riskLevel} risk)`));
        return {
          approved: true,
          timestamp: new Date(),
          approver: 'system',
          processingTime: 0
        };
      }

      // For readonly analysis, auto-approve
      if (request.title && (
        request.title.toLowerCase().includes('readonly') ||
        request.title.toLowerCase().includes('analisi') ||
        request.title.toLowerCase().includes('reads')
      )) {
        console.log(chalk.green(`✓ Auto-approved readonly operation: ${request.title}`));
        return {
          approved: true,
          timestamp: new Date(),
          approver: 'system',
          processingTime: 0
        };
      }

      // Enhanced display for enterprise
      if (this.config.enterpriseMode) {
        this.displayEnterpriseApprovalRequest(request);
      } else {
        this.displayApprovalRequest(request);
      }

      // Get user input with enterprise features
      const response = await this.promptForApproval(request);

      // Add enterprise fields to response
      if (this.config.enterpriseMode) {
        response.approver = response.approver || 'system';
        response.auditTrail = [{
          timestamp: new Date(),
          actor: response.approver,
          action: response.approved ? 'approved' : 'rejected',
          details: { requestId: request.id, comments: response.userComments },
          sessionId: this.sessionId
        }];
      }

      return response;
    } finally {
      this.pendingRequests.delete(request.id);
    }
  }

  /**
   * Quick approval for simple operations
   */
  async quickApproval(
    title: string,
    description: string,
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<boolean> {
    const request: ApprovalRequest = {
      id: `quick-${Date.now()}`,
      title,
      description,
      riskLevel,
      actions: [],
    };

    const response = await this.requestApproval(request);
    return response.approved;
  }



  /**
   * Generic confirmation prompt using Inquirer.
   * Uses inputQueue bypass to avoid interference with the main input loop.
   */
  async confirm(
    question: string,
    details?: string,
    defaultValue: boolean = false
  ): Promise<boolean> {
    if (details) {
      console.log(chalk.gray(`   ${details}`));
    }

    // Spacing before the prompt
    console.log();

    inputQueue.enableBypass();
    try {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'ok',
          message: chalk.cyan.bold(`❓ ${question}`),
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false }
          ],
          default: defaultValue ? 0 : 1,
          prefix: '  ',
        },
      ]);

      console.log();
      return !!answers.ok;
    } catch {
      return false;
    } finally {
      inputQueue.disableBypass();
    }
  }

  /**
   * Generic text input prompt using Inquirer.
   * Uses inputQueue bypass to avoid interference with the main input loop.
   */
  async promptInput(message: string, defaultValue: string = ''): Promise<string> {
    // Spacing before the prompt
    console.log();

    inputQueue.enableBypass();
    try {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'value',
          message: chalk.cyan(message),
          default: defaultValue,
          prefix: '  ',
        },
      ]);

      console.log();
      return (answers.value ?? '').toString();
    } catch {
      return '';
    } finally {
      inputQueue.disableBypass();
    }
  }


  /**
   * Request approval for file operations with diff preview
   */
  async requestFileApproval(
    title: string,
    fileDiffs: FileDiff[],
    riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<boolean> {
    console.log(chalk.blue.bold(`\\n🔍 ${title}`));

    // Show file diffs
    DiffViewer.showMultiFileDiff(fileDiffs, { compact: true });

    const actions: ApprovalAction[] = fileDiffs.map(diff => ({
      type: diff.isNew ? 'file_create' : diff.isDeleted ? 'file_delete' : 'file_modify',
      description: `${diff.isNew ? 'Create' : diff.isDeleted ? 'Delete' : 'Modify'} ${diff.filePath}`,
      details: diff,
      riskLevel: diff.isDeleted ? 'high' : 'medium',
    }));

    const request: ApprovalRequest = {
      id: `file-${Date.now()}`,
      title,
      description: `File operations on ${fileDiffs.length} files`,
      riskLevel,
      actions,
      context: {
        affectedFiles: fileDiffs.map(d => d.filePath),
      },
    };

    const response = await this.requestApproval(request);
    return response.approved;
  }

  /**
   * Request approval for command execution
   */
  async requestCommandApproval(
    command: string,
    args: string[] = [],
    workingDir?: string
  ): Promise<boolean> {
    const fullCommand = `${command} ${args.join(' ')}`;

    // Assess risk level based on command
    const riskLevel = this.assessCommandRisk(command, args);

    const request: ApprovalRequest = {
      id: `cmd-${Date.now()}`,
      title: 'Execute Command',
      description: `Run: ${fullCommand}`,
      riskLevel,
      actions: [{
        type: 'command_execute',
        description: `Execute: ${fullCommand}`,
        details: { command, args, workingDir },
        riskLevel,
      }],
      context: {
        workingDirectory: workingDir,
      },
    };

    const response = await this.requestApproval(request);
    return response.approved;
  }

  /**
   * Request approval for package installation
   */
  async requestPackageApproval(
    packages: string[],
    manager: 'npm' | 'yarn' | 'pnpm' = 'npm',
    isGlobal: boolean = false
  ): Promise<boolean> {
    const riskLevel = isGlobal ? 'high' : 'medium';

    const request: ApprovalRequest = {
      id: `pkg-${Date.now()}`,
      title: 'Install Packages',
      description: `Install ${packages.length} package(s) with ${manager}${isGlobal ? ' (global)' : ''}`,
      riskLevel,
      actions: packages.map(pkg => ({
        type: 'package_install',
        description: `Install ${pkg}`,
        details: { package: pkg, manager, isGlobal },
        riskLevel,
      })),
    };

    const response = await this.requestApproval(request);
    return response.approved;
  }

  /**
   * Enhanced approval for plan execution with detailed breakdown
   */
  async requestPlanApproval(
    title: string,
    description: string,
    planDetails: {
      totalSteps: number;
      estimatedDuration: number;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      categories: string[];
      priorities: Record<string, number>;
      dependencies: number;
      affectedFiles?: string[];
      commands?: string[];
    },
    options?: {
      showBreakdown?: boolean;
      allowModification?: boolean;
      showTimeline?: boolean;
    }
  ): Promise<{
    approved: boolean;
    modifications?: {
      skipSteps?: string[];
      modifySteps?: Record<string, any>;
      addSteps?: any[];
    };
    userComments?: string;
  }> {
    const request: ApprovalRequest = {
      id: `plan-${Date.now()}`,
      title,
      description,
      riskLevel: planDetails.riskLevel,
      type: 'plan',
      actions: [],
      context: {
        estimatedDuration: planDetails.estimatedDuration,
        affectedFiles: planDetails.affectedFiles,
        planDetails: {
          totalSteps: planDetails.totalSteps,
          categories: planDetails.categories,
          priorities: Object.keys(planDetails.priorities),
          dependencies: planDetails.dependencies,
        },
      },
    };

    // Enhanced display for plan approval
    this.displayPlanApprovalRequest(request, planDetails, options);

    const response = await this.requestApproval(request);

    return {
      approved: response.approved,
      userComments: response.userComments,
    };
  }

  /**
   * Display approval request to user with improved formatting
   */
  private displayApprovalRequest(request: ApprovalRequest): void {
    const riskColor = this.getRiskColor(request.riskLevel);
    const riskIcon = this.getRiskIcon(request.riskLevel);

    // Add clear visual separation
    console.log(chalk.gray('─'.repeat(60)));
    console.log();

    console.log(boxen(
      `${riskIcon} ${chalk.bold(request.title)}\n\n` +
      `${chalk.gray('Description:')} ${request.description}\n` +
      `${chalk.gray('Risk Level:')} ${riskColor(request.riskLevel.toUpperCase())}\n` +
      `${chalk.gray('Actions:')} ${request.actions.length}`,
      {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: request.riskLevel === 'critical' ? 'red' :
          request.riskLevel === 'high' ? 'yellow' : 'blue',
      }
    ));

    // Show detailed actions
    if (request.actions.length > 0) {
      console.log(chalk.blue.bold('\n📋 Planned Actions:'));
      request.actions.forEach((action, index) => {
        const actionRisk = this.getRiskColor(action.riskLevel);
        const actionIcon = this.getActionIcon(action.type);

        console.log(`  ${index + 1}. ${actionIcon} ${action.description} ${actionRisk(`[${action.riskLevel}]`)}`);
      });
    }

    // Show context if available
    if (request.context) {
      console.log(chalk.blue.bold('\n🔍 Context:'));
      if (request.context.workingDirectory) {
        console.log(`  📁 Working Directory: ${request.context.workingDirectory}`);
      }
      if (request.context.affectedFiles && request.context.affectedFiles.length > 0) {
        console.log(`  📄 Affected Files: ${request.context.affectedFiles.length}`);
        request.context.affectedFiles.slice(0, 5).forEach(file => {
          console.log(`     • ${file}`);
        });
        if (request.context.affectedFiles.length > 5) {
          console.log(`     ... and ${request.context.affectedFiles.length - 5} more files`);
        }
      }
      if (request.context.estimatedDuration) {
        console.log(`  ⏱️  Estimated Duration: ${Math.round(request.context.estimatedDuration / 1000)}s`);
      }
    }
  }

  /**
   * Display enhanced plan approval request
   */
  private displayPlanApprovalRequest(
    request: ApprovalRequest,
    planDetails: any,
    options?: any
  ): void {
    const riskColor = this.getRiskColor(request.riskLevel);
    const riskIcon = this.getRiskIcon(request.riskLevel);

    console.log(chalk.gray('═'.repeat(80)));
    console.log();

    // Main plan header
    console.log(boxen(
      `${riskIcon} ${chalk.bold(request.title)}\n\n` +
      `${chalk.gray('Description:')} ${request.description}\n` +
      `${chalk.gray('Risk Level:')} ${riskColor(request.riskLevel.toUpperCase())}\n` +
      `${chalk.gray('Total Steps:')} ${planDetails.totalSteps}\n` +
      `${chalk.gray('Estimated Duration:')} ${Math.round(planDetails.estimatedDuration)} minutes`,
      {
        padding: 1,
        margin: { top: 0, bottom: 1, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: request.riskLevel === 'critical' ? 'red' :
          request.riskLevel === 'high' ? 'yellow' : 'blue',
      }
    ));

    // Plan breakdown
    if (options?.showBreakdown !== false) {
      console.log(chalk.blue.bold('\n📊 Plan Breakdown:'));

      // Categories
      if (planDetails.categories && planDetails.categories.length > 0) {
        console.log(chalk.cyan('  📁 Categories:'));
        planDetails.categories.forEach((cat: string) => {
          console.log(`     • ${cat}`);
        });
      }

      // Priorities
      if (planDetails.priorities) {
        console.log(chalk.cyan('\n  🎯 Priority Distribution:'));
        Object.entries(planDetails.priorities).forEach(([priority, count]) => {
          const icon = this.getPriorityIcon(priority);
          console.log(`     ${icon} ${priority}: ${count} steps`);
        });
      }

      // Dependencies
      if (planDetails.dependencies > 0) {
        console.log(chalk.cyan('\n  🔗 Dependencies:'));
        console.log(`     • ${planDetails.dependencies} steps have dependencies`);
      }
    }

    // Risk analysis
    if (options?.showRiskAnalysis !== false) {
      console.log(chalk.blue.bold('\n⚠️  Risk Analysis:'));
      this.displayPlanRiskAnalysis(planDetails);
    }

    // Timeline
    if (options?.showTimeline !== false) {
      console.log(chalk.blue.bold('\n⏱️  Estimated Timeline:'));
      this.displayPlanTimeline(planDetails);
    }

    // Affected files
    if (planDetails.affectedFiles && planDetails.affectedFiles.length > 0) {
      console.log(chalk.blue.bold('\n📄 Files to be Modified:'));
      planDetails.affectedFiles.slice(0, 10).forEach((file: string) => {
        console.log(`  • ${file}`);
      });
      if (planDetails.affectedFiles.length > 10) {
        console.log(`  ... and ${planDetails.affectedFiles.length - 10} more files`);
      }
    }

    // Commands to be executed
    if (planDetails.commands && planDetails.commands.length > 0) {
      console.log(chalk.blue.bold('\n⚡ Commands to be Executed:'));
      planDetails.commands.slice(0, 5).forEach((cmd: string) => {
        console.log(`  • ${cmd}`);
      });
      if (planDetails.commands.length > 5) {
        console.log(`  ... and ${planDetails.commands.length - 5} more commands`);
      }
    }
  }

  /**
   * Display plan risk analysis
   */
  private displayPlanRiskAnalysis(planDetails: any): void {
    const riskFactors = [];

    if (planDetails.riskLevel === 'critical') {
      riskFactors.push('🔴 Critical risk operations detected');
    }
    if (planDetails.riskLevel === 'high') {
      riskFactors.push('🟡 High risk operations detected');
    }
    if (planDetails.affectedFiles && planDetails.affectedFiles.length > 10) {
      riskFactors.push('📄 Large number of files will be modified');
    }
    if (planDetails.commands && planDetails.commands.some((cmd: string) =>
      cmd.includes('rm') || cmd.includes('del') || cmd.includes('sudo')
    )) {
      riskFactors.push('⚡ Destructive commands detected');
    }
    if (planDetails.dependencies > 5) {
      riskFactors.push('🔗 Complex dependency chain');
    }

    if (riskFactors.length === 0) {
      console.log('  ✅ No significant risks identified');
    } else {
      riskFactors.forEach(factor => {
        console.log(`  ${factor}`);
      });
    }
  }

  /**
   * Display plan timeline
   */
  private displayPlanTimeline(planDetails: any): void {
    const duration = planDetails.estimatedDuration;
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;

    if (hours > 0) {
      console.log(`  ⏱️  Estimated completion time: ${hours}h ${minutes}m`);
    } else {
      console.log(`  ⏱️  Estimated completion time: ${minutes} minutes`);
    }

    // Show progress milestones
    const milestones = [
      { percentage: 25, description: 'Initial setup and analysis' },
      { percentage: 50, description: 'Core implementation' },
      { percentage: 75, description: 'Testing and validation' },
      { percentage: 100, description: 'Finalization and cleanup' }
    ];

    console.log(chalk.gray('  📈 Progress milestones:'));
    milestones.forEach(milestone => {
      const timeAtMilestone = Math.round((duration * milestone.percentage) / 100);
      console.log(`     ${milestone.percentage}% (${timeAtMilestone}m): ${milestone.description}`);
    });
  }

  /**
   * Prompt user for approval with improved formatting
   */
  private async promptForApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    // Add spacing before the prompt
    console.log();

    const questions: any[] = [
      {
        type: 'list',
        name: 'approved',
        message: chalk.cyan.bold('\n❓ Do you approve this operation?'),
        choices: [
          { name: 'Yes', value: true },
          { name: 'No', value: false }
        ],
        default: request.riskLevel === 'low' ? 0 : 1,
        prefix: '  ',
      },
    ];

    // For high-risk operations, ask for additional confirmation
    if (request.riskLevel === 'critical' || request.riskLevel === 'high') {
      questions.push({
        type: 'list',
        name: 'confirmHighRisk',
        message: chalk.red.bold('⚠️  This is a high-risk operation. Are you absolutely sure?'),
        choices: [
          { name: 'Yes', value: true },
          { name: 'No', value: false }
        ],
        default: 1,
        prefix: '  ',
        when: (answers: any) => answers.approved,
      });
    }

    // Option to add comments for complex operations
    if (request.actions.length > 3) {
      questions.push({
        type: 'input',
        name: 'userComments',
        message: 'Add any comments (optional):',
        when: (answers: any) => answers.approved,
      });
    }

    inputQueue.enableBypass();
    try {
      const answers = await inquirer.prompt(questions);

      const approved = answers.approved && (answers.confirmHighRisk !== false);

      // Add spacing and clear result
      console.log();

      if (approved) {
        console.log(chalk.green.bold('✅ Operation approved'));
      } else {
        console.log(chalk.yellow.bold('❌ Operation cancelled'));
      }

      // Add final spacing
      console.log();

      return {
        approved,
        userComments: answers.userComments,
        timestamp: new Date(),
      };
    } catch (error) {
      // Handle Ctrl+C or other interruption
      console.log(chalk.red('\n❌ Operation cancelled by user'));
      return {
        approved: false,
        timestamp: new Date(),
      };
    } finally {
      inputQueue.disableBypass();
    }
  }

  /**
   * Check if operation should be auto-approved
   */
  private shouldAutoApprove(request: ApprovalRequest): boolean {
    const config = this.config.autoApprove;

    if (!config) return false;

    // Auto-approve plan execution if enabled
    if (request.type === 'plan' && config.planExecution) return true;

    // Check risk level auto-approval
    if (request.riskLevel === 'low' && config.lowRisk) return true;
    if (request.riskLevel === 'medium' && config.mediumRisk) return true;

    // Check specific operation types
    const hasFileOps = request.actions.some(a =>
      ['file_create', 'file_modify', 'file_delete'].includes(a.type)
    );
    if (hasFileOps && config.fileOperations) return true;

    const hasPackageInstalls = request.actions.some(a => a.type === 'package_install');
    if (hasPackageInstalls && config.packageInstalls) return true;

    return false;
  }

  /**
   * Assess command risk level
   */
  private assessCommandRisk(command: string, args: string[]): 'low' | 'medium' | 'high' | 'critical' {
    const cmd = command.toLowerCase();
    const fullCommand = `${cmd} ${args.join(' ')}`.toLowerCase();

    // Critical risk commands
    const criticalCommands = ['rm -rf', 'sudo rm', 'format', 'fdisk', 'dd'];
    if (criticalCommands.some(dangerous => fullCommand.includes(dangerous))) {
      return 'critical';
    }

    // High risk commands
    const highRiskCommands = ['rm', 'del', 'sudo', 'chmod 777', 'chown'];
    if (highRiskCommands.some(risky => fullCommand.includes(risky))) {
      return 'high';
    }

    // Medium risk commands
    const mediumRiskCommands = ['npm install -g', 'yarn global', 'pip install', 'docker run'];
    if (mediumRiskCommands.some(medium => fullCommand.includes(medium))) {
      return 'medium';
    }

    // Network commands
    const networkCommands = ['curl', 'wget', 'fetch', 'http'];
    if (networkCommands.some(net => cmd.includes(net))) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Get color for risk level
   */
  private getRiskColor(risk: string): any {
    switch (risk) {
      case 'critical': return chalk.red.bold;
      case 'high': return chalk.red;
      case 'medium': return chalk.yellow;
      case 'low': return chalk.green;
      default: return chalk.gray;
    }
  }

  /**
   * Get icon for risk level
   */
  private getRiskIcon(risk: string): string {
    switch (risk) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '⚡';
      case 'low': return 'ℹ️';
      default: return '📋';
    }
  }

  /**
   * Get icon for action type
   */
  private getActionIcon(type: string): string {
    switch (type) {
      case 'file_create': return '📄';
      case 'file_modify': return '✏️';
      case 'file_delete': return '🗑️';
      case 'command_execute': return '⚡';
      case 'package_install': return '📦';
      case 'network_request': return '🌐';
      default: return '🔧';
    }
  }

  /**
   * Get priority icon
   */
  private getPriorityIcon(priority: string): string {
    switch (priority.toLowerCase()) {
      case 'critical': return '🔴';
      case 'high': return '🟡';
      case 'medium': return '🟢';
      case 'low': return '🔵';
      default: return '⚪';
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ApprovalConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): ApprovalConfig {
    return { ...this.config };
  }

  // ========================================
  // ENTERPRISE METHODS
  // ========================================

  /**
   * Log audit entry with enterprise features
   */
  private logAuditEntry(entry: AuditEntry): void {
    this.auditLog.push(entry);

    // Emit audit event for external enterprise systems
    this.emit('audit:logged', entry);

    // Enterprise audit retention policies
    const maxEntries = this.config.securitySettings?.auditRetention || 50000;
    if (this.auditLog.length > maxEntries) {
      this.auditLog = this.auditLog.slice(-Math.floor(maxEntries * 0.8));
    }
  }

  /**
   * Check enterprise auto-approval rules
   */
  private async checkEnterpriseAutoApproval(request: ApprovalRequest): Promise<{ approved: boolean; reason?: string }> {
    const user = this.users.get(request.requesterId || 'system');
    if (!user?.preferences?.autoApproveRules) {
      return { approved: false };
    }

    for (const rule of user.preferences.autoApproveRules) {
      if (!rule.active) continue;

      if (this.evaluateAutoApprovalRule(rule, request)) {
        return {
          approved: true,
          reason: `Auto-approved by enterprise rule: ${rule.name}`
        };
      }
    }

    // Check system-level auto-approval for enterprise
    if (request.riskLevel === 'low' && (!request.riskAssessment || request.riskAssessment.overallScore < 30)) {
      return {
        approved: true,
        reason: 'Auto-approved: Low risk enterprise operation'
      };
    }

    return { approved: false };
  }

  /**
   * Evaluate auto-approval rule
   */
  private evaluateAutoApprovalRule(rule: AutoApprovalRule, request: ApprovalRequest): boolean {
    for (const condition of rule.conditions) {
      if (!this.evaluateCondition(condition, request)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: RuleCondition, request: ApprovalRequest): boolean {
    const fieldValue = this.getFieldValue(condition.field, request);

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'contains':
        return String(fieldValue).includes(condition.value);
      case 'greater_than':
        return Number(fieldValue) > Number(condition.value);
      case 'less_than':
        return Number(fieldValue) < Number(condition.value);
      default:
        return false;
    }
  }

  /**
   * Get field value from request
   */
  private getFieldValue(field: string, request: ApprovalRequest): any {
    const parts = field.split('.');
    let value: any = request;

    for (const part of parts) {
      value = value[part];
      if (value === undefined) break;
    }

    return value;
  }

  /**
 * Get enterprise statistics and analytics
 */
  getEnterpriseStatistics(): any {
    const approvedCount = this.auditLog.filter(entry => entry.action === 'approved').length;
    const totalCount = this.auditLog.filter(entry =>
      entry.action === 'approved' || entry.action === 'rejected'
    ).length;

    return {
      pendingRequests: this.pendingRequests.size,
      activeWorkflows: this.activeWorkflows.size,
      totalRequests: this.auditLog.filter(entry => entry.action === 'approval_requested').length,
      approvalRate: totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0,
      escalationRate: this.auditLog.filter(entry => entry.action === 'escalate').length,
      complianceScore: 95, // Example enterprise score
      auditEntries: this.auditLog.length
    };
  }

  /**
   * Display enterprise approval request with advanced UI
   */
  private displayEnterpriseApprovalRequest(request: ApprovalRequest): void {
    console.clear();

    // Header with enterprise branding
    const header = boxen(
      chalk.cyanBright.bold('🏢 ENTERPRISE APPROVAL SYSTEM') + '\n' +
      chalk.white('Advanced Workflow Management & Risk Assessment'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'cyan',
        textAlignment: 'center'
      }
    );
    console.log(header);

    // Request overview with enterprise details
    console.log(chalk.yellow.bold('\n📋 ENTERPRISE REQUEST OVERVIEW'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`${chalk.blue('Title:')} ${request.title}`);
    console.log(`${chalk.blue('Description:')} ${request.description}`);
    if (request.requesterInfo) {
      console.log(`${chalk.blue('Requester:')} ${request.requesterInfo.username} (${request.requesterInfo.role})`);
      console.log(`${chalk.blue('Department:')} ${request.requesterInfo.department}`);
    }
    console.log(`${chalk.blue('Type:')} ${(request.type || 'general').toUpperCase()}`);
    console.log(`${chalk.blue('Risk Level:')} ${this.getRiskColor(request.riskLevel)(request.riskLevel.toUpperCase())}`);

    // Enhanced risk assessment display
    if (request.riskAssessment) {
      console.log(chalk.red.bold('\n⚠️  ENTERPRISE RISK ASSESSMENT'));
      console.log(chalk.gray('─'.repeat(50)));

      const riskColor = request.riskAssessment.overallScore > 70 ? chalk.red :
        request.riskAssessment.overallScore > 40 ? chalk.yellow : chalk.green;

      console.log(`${chalk.blue('Overall Risk Score:')} ${riskColor(request.riskAssessment.overallScore + '/100')}`);

      if (request.riskAssessment.factors && request.riskAssessment.factors.length > 0) {
        console.log(`${chalk.blue('Risk Factors:')}`);
        request.riskAssessment.factors.slice(0, 3).forEach(factor => {
          const factorColor = factor.score > 70 ? chalk.red :
            factor.score > 40 ? chalk.yellow : chalk.green;
          console.log(`  • ${factor.name}: ${factorColor(factor.score)} (${factor.description})`);
        });
      }

      if (request.riskAssessment.mitigations && request.riskAssessment.mitigations.length > 0) {
        console.log(`${chalk.blue('Recommended Mitigations:')}`);
        request.riskAssessment.mitigations.slice(0, 3).forEach(mitigation => {
          console.log(`  • ${mitigation}`);
        });
      }
    }

    // Enhanced actions overview
    console.log(chalk.green.bold('\n⚡ ENTERPRISE ACTIONS OVERVIEW'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.blue('Total Actions:')} ${request.actions.length}`);

    const riskSummary = request.actions.reduce((acc, action) => {
      acc[action.riskLevel] = (acc[action.riskLevel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(riskSummary).forEach(([risk, count]) => {
      const riskColor = risk === 'critical' ? chalk.red :
        risk === 'high' ? chalk.red :
          risk === 'medium' ? chalk.yellow : chalk.green;
      console.log(`  ${riskColor('•')} ${risk.toUpperCase()}: ${count} actions`);
    });

    // Show key actions
    if (request.actions.length > 0) {
      console.log(`${chalk.blue('Key Actions:')}`);
      request.actions.slice(0, 5).forEach((action, index) => {
        const icon = this.getActionIcon(action.type);
        console.log(`  ${index + 1}. ${icon} ${action.description}`);
      });

      if (request.actions.length > 5) {
        console.log(`  ... and ${request.actions.length - 5} more actions`);
      }
    }

    // Enhanced context display
    if (request.context) {
      console.log(chalk.magenta.bold('\n🏢 ENTERPRISE BUSINESS CONTEXT'));
      console.log(chalk.gray('─'.repeat(50)));

      if (request.context.workingDirectory) {
        console.log(`${chalk.blue('Working Directory:')} ${request.context.workingDirectory}`);
      }

      if (request.context.estimatedDuration) {
        console.log(`${chalk.blue('Estimated Duration:')} ${Math.round(request.context.estimatedDuration / 1000)}s`);
      }

      if (request.context.affectedFiles && request.context.affectedFiles.length > 0) {
        console.log(`${chalk.blue('Affected Files:')} ${request.context.affectedFiles.length} files`);
        request.context.affectedFiles.slice(0, 3).forEach((file: string) => {
          console.log(`  • ${file}`);
        });
        if (request.context.affectedFiles.length > 3) {
          console.log(`  ... and ${request.context.affectedFiles.length - 3} more files`);
        }
      }
    }

    // Compliance information
    if (request.compliance) {
      console.log(chalk.cyan.bold('\n📜 ENTERPRISE COMPLIANCE & GOVERNANCE'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`${chalk.blue('Classification:')} ${request.compliance.classification.toUpperCase()}`);
      console.log(`${chalk.blue('Frameworks:')} ${request.compliance.frameworks.join(', ')}`);
      console.log(`${chalk.blue('Retention Period:')} ${Math.floor(request.compliance.retentionPeriod / (1000 * 60 * 60 * 24))} days`);
    }
  }

  /**
   * Create auto-approval response with enterprise features
   */
  private createAutoApprovalResponse(
    request: ApprovalRequest,
    autoApprovalResult: { approved: boolean; reason?: string },
    startTime: number
  ): ApprovalResponse {
    const response: ApprovalResponse = {
      approved: true,
      approver: 'enterprise-system',
      userComments: autoApprovalResult.reason,
      timestamp: new Date(),
      processingTime: Date.now() - startTime,
      auditTrail: [{
        timestamp: new Date(),
        actor: 'enterprise-system',
        action: 'auto_approved',
        details: { reason: autoApprovalResult.reason, requestId: request.id },
        sessionId: this.sessionId
      }]
    };

    // Log enterprise audit entry
    this.logAuditEntry({
      timestamp: new Date(),
      actor: 'enterprise-system',
      action: 'auto_approved',
      details: { requestId: request.id, reason: autoApprovalResult.reason },
      sessionId: this.sessionId
    });

    console.log(chalk.green.bold(`✅ Enterprise Auto-Approved: ${request.title}`));
    console.log(chalk.gray(`   Reason: ${autoApprovalResult.reason}`));

    return response;
  }

  /**
   * Execute enterprise workflow
   */
  private async executeEnterpriseWorkflow(request: ApprovalRequest, startTime: number): Promise<ApprovalResponse> {
    // Enhanced UI for enterprise approval
    this.displayEnterpriseApprovalRequest(request);

    // Enable bypass for approval inputs
    inputQueue.enableBypass();

    try {
      const response = await this.promptForEnterpriseApproval(request);

      response.processingTime = Date.now() - startTime;
      response.workflowId = request.workflow?.id;

      // Log enterprise audit entry
      this.logAuditEntry({
        timestamp: new Date(),
        actor: response.approver || 'system',
        action: response.approved ? 'approved' : 'rejected',
        details: {
          requestId: request.id,
          comments: response.userComments,
          conditions: response.conditions
        },
        sessionId: this.sessionId
      });

      // Emit enterprise events
      this.emit(response.approved ? 'request:approved' : 'request:rejected', response);

      return response;
    } finally {
      inputQueue.disableBypass();
      this.activeWorkflows.delete(request.id);
      this.pendingRequests.delete(request.id);
    }
  }

  /**
   * Prompt for enterprise approval with advanced options
   */
  private async promptForEnterpriseApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    const startTime = Date.now();

    const questions = [
      {
        type: 'list',
        name: 'decision',
        message: chalk.yellow.bold('\n🚀 ENTERPRISE APPROVAL DECISION:'),
        choices: [
          { name: '✅ Approve Request', value: 'approve' },
          { name: '❌ Reject Request', value: 'reject' },
          { name: '⚠️  Approve with Conditions', value: 'conditional' },
          { name: '📋 Request More Information', value: 'info' },
          { name: '⬆️  Escalate to Manager', value: 'escalate' }
        ]
      },
      {
        type: 'input',
        name: 'comments',
        message: 'Business justification and comments:',
        when: (answers: any) => answers.decision !== 'info'
      },
      {
        type: 'checkbox',
        name: 'conditions',
        message: 'Select enterprise conditions (if conditional approval):',
        choices: [
          { name: 'Require additional review after execution', value: 'post_review' },
          { name: 'Limit to non-production environment only', value: 'non_prod_only' },
          { name: 'Require continuous monitoring during execution', value: 'monitor_execution' },
          { name: 'Set expiration for approval (24 hours)', value: 'time_limit' },
          { name: 'Require compliance officer sign-off', value: 'compliance_review' }
        ],
        when: (answers: any) => answers.decision === 'conditional'
      }
    ];

    const answers = await inquirer.prompt(questions);

    const approved = answers.decision === 'approve' || answers.decision === 'conditional';

    const response: ApprovalResponse = {
      approved,
      approver: 'enterprise-user',
      userComments: answers.comments,
      conditions: answers.conditions?.map((condition: string) => ({
        type: 'requirement' as const,
        description: condition,
        enforced: true
      })),
      timestamp: new Date(),
      processingTime: Date.now() - startTime,
      auditTrail: [{
        timestamp: new Date(),
        actor: 'enterprise-user',
        action: answers.decision,
        details: {
          comments: answers.comments,
          conditions: answers.conditions
        },
        sessionId: this.sessionId
      }]
    };

    // Handle escalation
    if (answers.decision === 'escalate') {
      response.approved = false;
      response.userComments = 'Escalated to manager for enterprise review';
      response.escalationLevel = 1;
      this.emit('workflow:escalated', { requestId: request.id, level: 1 });
    }

    // Display enterprise result
    console.log();
    if (approved) {
      console.log(chalk.green.bold('✅ Enterprise Operation Approved'));
      if (answers.conditions && answers.conditions.length > 0) {
        console.log(chalk.yellow('⚠️  Conditional approval with enterprise requirements'));
      }
    } else {
      console.log(chalk.red.bold('❌ Enterprise Operation Rejected'));
    }
    console.log();

    return response;
  }

  /**
   * Enterprise event handlers
   */
  private handleRequestSubmitted(request: ApprovalRequest): void {
    if (this.config.auditLevel === 'full') {
      console.log(chalk.blue(`📤 Enterprise request submitted: ${request.title}`));
    }
  }

  private handleRequestApproved(response: ApprovalResponse): void {
    if (this.config.auditLevel !== 'basic') {
      console.log(chalk.green(`✅ Enterprise request approved by ${response.approver}`));
    }
  }

  private handleRequestRejected(response: ApprovalResponse): void {
    if (this.config.auditLevel !== 'basic') {
      console.log(chalk.red(`❌ Enterprise request rejected by ${response.approver}`));
    }
  }

  private handleWorkflowEscalated(data: any): void {
    console.log(chalk.yellow(`⬆️ Enterprise workflow escalated: ${data.requestId} (Level ${data.level})`));
  }

  private handleComplianceViolation(violation: any): void {
    console.log(chalk.red(`🚨 Enterprise compliance violation detected: ${violation.type}`));
  }
}

// ========================================
// ENTERPRISE ENGINE CLASSES
// ========================================

/**
 * Enterprise Risk Assessment Engine
 */
class RiskEngine {
  async assessRisk(request: ApprovalRequest): Promise<RiskAssessment> {
    const factors: RiskFactor[] = [];
    let overallScore = 0;

    // Assess various risk factors
    factors.push(...this.assessOperationalRisk(request));
    factors.push(...this.assessSecurityRisk(request));
    factors.push(...this.assessComplianceRisk(request));

    // Calculate overall score
    overallScore = factors.reduce((sum, factor) => sum + (factor.score * factor.weight), 0) /
      factors.reduce((sum, factor) => sum + factor.weight, 1);

    return {
      overallScore: Math.round(overallScore),
      factors,
      mitigations: this.generateMitigations(factors),
      recommendations: this.generateRecommendations(factors),
      automaticFlags: this.generateSecurityFlags(request, factors)
    };
  }

  private assessOperationalRisk(request: ApprovalRequest): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // File operation risks
    const fileOps = request.actions.filter(action =>
      action.type.includes('file') || action.type.includes('File')
    );

    if (fileOps.length > 0) {
      factors.push({
        name: 'File Operations',
        score: Math.min(fileOps.length * 10, 70),
        weight: 0.3,
        description: `${fileOps.length} file operations detected`,
        category: 'operations'
      });
    }

    return factors;
  }

  private assessSecurityRisk(request: ApprovalRequest): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // Command execution risks
    const commandOps = request.actions.filter(action =>
      action.type.includes('command') || action.type.includes('execute')
    );

    if (commandOps.length > 0) {
      factors.push({
        name: 'Command Execution',
        score: Math.min(commandOps.length * 15, 80),
        weight: 0.4,
        description: `${commandOps.length} command executions`,
        category: 'security'
      });
    }

    return factors;
  }

  private assessComplianceRisk(request: ApprovalRequest): RiskFactor[] {
    const factors: RiskFactor[] = [];

    // Add compliance-specific risk assessment
    if (request.context?.affectedFiles && request.context.affectedFiles.length > 10) {
      factors.push({
        name: 'Large File Impact',
        score: 40,
        weight: 0.2,
        description: 'Large number of files affected',
        category: 'compliance'
      });
    }

    return factors;
  }

  private generateMitigations(factors: RiskFactor[]): string[] {
    const mitigations: string[] = [];

    factors.forEach(factor => {
      if (factor.score > 50) {
        switch (factor.category) {
          case 'security':
            mitigations.push('Enable additional security monitoring during execution');
            break;
          case 'operations':
            mitigations.push('Implement automated rollback procedures');
            break;
          case 'compliance':
            mitigations.push('Ensure compliance documentation is updated');
            break;
        }
      }
    });

    return mitigations;
  }

  private generateRecommendations(factors: RiskFactor[]): string[] {
    const recommendations: string[] = [];

    if (factors.some(f => f.score > 70)) {
      recommendations.push('Consider breaking into smaller, lower-risk operations');
    }

    if (factors.some(f => f.category === 'security' && f.score > 50)) {
      recommendations.push('Implement additional security reviews and monitoring');
    }

    return recommendations;
  }

  private generateSecurityFlags(request: ApprovalRequest, factors: RiskFactor[]): SecurityFlag[] {
    const flags: SecurityFlag[] = [];

    // Check for high-risk patterns
    const highRiskActions = request.actions.filter(action => action.riskLevel === 'critical');
    if (highRiskActions.length > 0) {
      flags.push({
        type: 'potential_threat',
        severity: 'critical',
        description: `${highRiskActions.length} critical risk actions detected`,
        recommendation: 'Require additional approvals for critical operations'
      });
    }

    return flags;
  }
}

/**
 * Enterprise Compliance Validation Engine
 */
class ComplianceEngine {
  async validateCompliance(request: ApprovalRequest): Promise<{
    passed: boolean;
    violations: string[];
    requirements: string[];
  }> {
    const violations: string[] = [];
    const requirements: string[] = [];

    // Basic enterprise compliance checks
    if (request.context?.workingDirectory?.includes('production') && request.riskLevel === 'critical') {
      requirements.push('Manager approval required for production critical changes');
    }

    if (request.actions.some(action => action.type === 'file_delete' && action.riskLevel === 'high')) {
      requirements.push('Data protection officer review required for high-risk deletions');
    }

    // Check for policy violations (only in strict enterprise mode)
    if (request.riskLevel === 'critical' && !request.businessJustification && request.requesterInfo?.role !== 'system') {
      violations.push('Business justification required for critical risk operations');
    }

    return {
      passed: violations.length === 0,
      violations,
      requirements
    };
  }
}

/**
 * Enterprise Workflow Management Engine
 */
class WorkflowEngine {
  async createWorkflow(request: ApprovalRequest): Promise<ApprovalWorkflow> {
    const steps: WorkflowStep[] = [];

    // Standard approval step
    steps.push({
      order: 1,
      name: 'Primary Approval',
      type: 'approval',
      approvers: ['system'],
      timeout: 300000, // 5 minutes
      optional: false
    });

    // Add escalation for high-risk requests
    if (request.riskAssessment && request.riskAssessment.overallScore > 70) {
      steps.push({
        order: 2,
        name: 'Manager Review',
        type: 'approval',
        approvers: ['manager'],
        timeout: 600000, // 10 minutes
        optional: false
      });
    }

    // Add compliance review for critical requests
    if (request.riskLevel === 'critical') {
      steps.push({
        order: 3,
        name: 'Compliance Review',
        type: 'review',
        approvers: ['compliance-officer'],
        timeout: 1800000, // 30 minutes
        optional: false
      });
    }

    return {
      id: `workflow-${Date.now()}`,
      name: 'Enterprise Approval Workflow',
      steps,
      currentStep: 0,
      escalationRules: [{
        trigger: 'timeout',
        delay: 300000, // 5 minutes
        action: 'escalate',
        target: 'manager'
      }],
      parallel: false
    };
  }
}

// Export singleton instance
export const approvalSystem = new ApprovalSystem();
