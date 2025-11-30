// src/cli/integrations/core/integration-orchestrator.ts

import { TaskMasterAI } from 'task-master-ai'
import type { EventBus } from '../../automation/agents/event-bus'
import type { EnhancedGitHubService } from '../github/github-service'
import type { EnhancedSlackService } from '../slack/slack-service'
import type { IntegrationConfig, WorkflowEvent } from '../types'

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  triggers: WorkflowTrigger[]
  actions: WorkflowAction[]
  conditions?: WorkflowCondition[]
  enabled: boolean
}

export interface WorkflowTrigger {
  type: 'github_event' | 'slack_command' | 'schedule' | 'manual'
  source: 'github' | 'slack' | 'system'
  event: string
  filters?: Record<string, any>
}

export interface WorkflowAction {
  type: 'github_operation' | 'slack_notification' | 'nikcli_command' | 'custom'
  service: 'github' | 'slack' | 'nikcli'
  operation: string
  parameters: Record<string, any>
  async: boolean
}

export interface WorkflowCondition {
  type: 'comparison' | 'regex' | 'exists' | 'custom'
  field: string
  operator: string
  value: any
}

export class IntegrationOrchestrator {
  private githubService: EnhancedGitHubService
  private slackService: EnhancedSlackService
  private eventBus: EventBus
  private taskMaster: TaskMasterAI
  private workflows: Map<string, WorkflowDefinition> = new Map()
  private config: IntegrationConfig

  constructor(
    config: IntegrationConfig,
    githubService: EnhancedGitHubService,
    slackService: EnhancedSlackService,
    eventBus: EventBus
  ) {
    this.config = config
    this.githubService = githubService
    this.slackService = slackService
    this.eventBus = eventBus
    this.taskMaster = new TaskMasterAI()

    this.initializeDefaultWorkflows()
    this.setupEventListeners()
  }

  private initializeDefaultWorkflows(): void {
    // Auto-review PR workflow
    this.workflows.set('auto-pr-review', {
      id: 'auto-pr-review',
      name: 'Auto PR Review',
      description: 'Automatically analyze and review GitHub PRs',
      triggers: [
        {
          type: 'github_event',
          source: 'github',
          event: 'pull_request.opened',
          filters: { action: 'opened' },
        },
      ],
      actions: [
        {
          type: 'github_operation',
          service: 'github',
          operation: 'analyzeRepository',
          parameters: {
            owner: '{{github.repository.owner}}',
            repo: '{{github.repository.name}}',
          },
          async: true,
        },
        {
          type: 'slack_notification',
          service: 'slack',
          operation: 'notifyRepositoryAnalysis',
          parameters: {
            channel: '{{config.defaultChannel}}',
            analysis: '{{action_result}}',
          },
          async: false,
        },
      ],
      enabled: true,
    })

    // Deployment monitoring workflow
    this.workflows.set('deployment-monitor', {
      id: 'deployment-monitor',
      name: 'Deployment Monitor',
      description: 'Monitor deployments and send notifications',
      triggers: [
        {
          type: 'github_event',
          source: 'github',
          event: 'workflow_run.completed',
        },
      ],
      actions: [
        {
          type: 'slack_notification',
          service: 'slack',
          operation: 'notifyDeploymentStatus',
          parameters: {
            channel: '{{config.devChannel}}',
            status: '{{github.workflow_run}}',
          },
          async: false,
        },
      ],
      enabled: true,
    })

    // Security alert workflow
    this.workflows.set('security-alerts', {
      id: 'security-alerts',
      name: 'Security Alerts',
      description: 'Notify team of security issues',
      triggers: [
        {
          type: 'github_event',
          source: 'github',
          event: 'security_advisory.published',
        },
      ],
      actions: [
        {
          type: 'slack_notification',
          service: 'slack',
          operation: 'sendErrorAlert',
          parameters: {
            channel: '{{config.securityChannel}}',
            error: {
              title: 'Security Advisory Published',
              description: '{{github.security_advisory.summary}}',
              severity: 'high',
              context: '{{github.security_advisory}}',
            },
          },
          async: false,
        },
      ],
      enabled: true,
    })

    // Slack command workflows
    this.workflows.set('slack-analyze-repo', {
      id: 'slack-analyze-repo',
      name: 'Slack Repository Analysis',
      description: 'Analyze repositories from Slack commands',
      triggers: [
        {
          type: 'slack_command',
          source: 'slack',
          event: 'nikcli analyze',
        },
      ],
      actions: [
        {
          type: 'github_operation',
          service: 'github',
          operation: 'analyzeRepository',
          parameters: {
            repo: '{{slack.command.args[0]}}',
          },
          async: true,
        },
        {
          type: 'slack_notification',
          service: 'slack',
          operation: 'notifyRepositoryAnalysis',
          parameters: {
            channel: '{{slack.command.channel}}',
            analysis: '{{action_result}}',
          },
          async: false,
        },
      ],
      enabled: true,
    })
  }

  private setupEventListeners(): void {
    // GitHub webhook events
    this.eventBus.on('github.pull_request', this.handleGitHubEvent.bind(this))
    this.eventBus.on('github.workflow_run', this.handleGitHubEvent.bind(this))
    this.eventBus.on('github.security_advisory', this.handleGitHubEvent.bind(this))

    // Slack command events
    this.eventBus.on('slack.slash_command', this.handleSlackCommand.bind(this))

    // System events
    this.eventBus.on('system.error', this.handleSystemError.bind(this))
    this.eventBus.on('system.health_check', this.handleHealthCheck.bind(this))
  }

  // Event Handlers
  private async handleGitHubEvent(event: WorkflowEvent): Promise<void> {
    console.log('🔗 Handling GitHub event:', event.type)

    // Find matching workflows
    const matchingWorkflows = this.findWorkflowsByTrigger('github_event', event.type)

    for (const workflow of matchingWorkflows) {
      try {
        if (await this.evaluateWorkflowConditions(workflow, event)) {
          await this.executeWorkflow(workflow, event)
        }
      } catch (error) {
        console.error(`Error executing workflow ${workflow.id}:`, error)
        await this.handleWorkflowError(workflow, error, event)
      }
    }
  }

  private async handleSlackCommand(event: WorkflowEvent): Promise<void> {
    console.log('💬 Handling Slack command:', event.data?.command)

    // Find matching workflows
    const matchingWorkflows = this.findWorkflowsByTrigger('slack_command', event.data?.command)

    for (const workflow of matchingWorkflows) {
      try {
        if (await this.evaluateWorkflowConditions(workflow, event)) {
          await this.executeWorkflow(workflow, event)
        }
      } catch (error) {
        console.error(`Error executing workflow ${workflow.id}:`, error)
        await this.handleWorkflowError(workflow, error, event)
      }
    }
  }

  private async handleSystemError(event: WorkflowEvent): Promise<void> {
    // Always notify security channel for critical errors
    if (event.data?.severity === 'critical') {
      await this.slackService.sendErrorAlert(this.config.securityChannel, {
        title: 'System Error',
        description: event.data?.message || 'Unknown system error',
        severity: 'critical',
        context: event.data,
        stackTrace: event.data?.stackTrace,
      })
    }
  }

  private async handleHealthCheck(event: WorkflowEvent): Promise<void> {
    const systemStatus = await this.getSystemHealthStatus()

    if (!systemStatus.healthy) {
      await this.slackService.sendErrorAlert(this.config.devChannel, {
        title: 'System Health Issue',
        description: systemStatus.issues.join(', '),
        severity: systemStatus.critical ? 'critical' : 'medium',
        context: systemStatus,
      })
    }
  }

  // Workflow Execution Engine
  private findWorkflowsByTrigger(triggerType: string, eventType: string): WorkflowDefinition[] {
    return Array.from(this.workflows.values()).filter(
      (workflow) =>
        workflow.enabled &&
        workflow.triggers.some((trigger) => trigger.type === triggerType && trigger.event === eventType)
    )
  }

  private async evaluateWorkflowConditions(workflow: WorkflowDefinition, event: WorkflowEvent): Promise<boolean> {
    if (!workflow.conditions || workflow.conditions.length === 0) {
      return true
    }

    for (const condition of workflow.conditions) {
      const result = await this.evaluateCondition(condition, event)
      if (!result) {
        return false
      }
    }

    return true
  }

  private async evaluateCondition(condition: WorkflowCondition, event: WorkflowEvent): Promise<boolean> {
    const template = condition.field.includes('{{') ? condition.field : `{{${condition.field}}}`
    const fieldValue = this.resolveTemplateValue(template, event, (event as any).actionResults ?? [])

    switch (condition.type) {
      case 'comparison':
        return this.evaluateComparison(fieldValue, condition.operator, condition.value)
      case 'regex':
        return new RegExp(condition.value).test(String(fieldValue))
      case 'exists':
        return fieldValue !== null && fieldValue !== undefined
      default:
        return true
    }
  }

  private evaluateComparison(left: any, operator: string, right: any): boolean {
    switch (operator) {
      case 'equals':
        return left === right
      case 'not_equals':
        return left !== right
      case 'greater_than':
        return Number(left) > Number(right)
      case 'less_than':
        return Number(left) < Number(right)
      case 'contains':
        return String(left).includes(String(right))
      case 'not_contains':
        return !String(left).includes(String(right))
      default:
        return false
    }
  }

  private async executeWorkflow(workflow: WorkflowDefinition, event: WorkflowEvent): Promise<void> {
    console.log(`🚀 Executing workflow: ${workflow.name}`)

    const actionResults: any[] = []

    for (const action of workflow.actions) {
      try {
        const result = await this.executeAction(action, event, actionResults)
        actionResults.push({ action, result })

        if (action.async) {
          // For async actions, don't wait for completion
          this.executeAsyncAction(action, result)
        }
      } catch (error) {
        console.error(`Error executing action ${action.operation}:`, error)
        actionResults.push({ action, error: error.message })

        // Stop workflow execution on critical errors
        if (action.operation.includes('critical')) {
          break
        }
      }
    }
    // Store action results for potential template expansion
    ;(event as any).actionResults = actionResults
  }

  private async executeAction(action: WorkflowAction, event: WorkflowEvent, previousResults: any[]): Promise<any> {
    const expandedParams = this.expandTemplateParameters(action.parameters, event, previousResults)

    switch (action.service) {
      case 'github':
        return await this.executeGitHubAction(action.operation, expandedParams)
      case 'slack':
        return await this.executeSlackAction(action.operation, expandedParams)
      case 'nikcli':
        return await this.executeNikCLIAction(action.operation, expandedParams)
      default:
        throw new Error(`Unknown service: ${action.service}`)
    }
  }

  private expandTemplateParameters(
    parameters: Record<string, any>,
    event: WorkflowEvent,
    previousResults: any[]
  ): Record<string, any> {
    const expanded: Record<string, any> = {}

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.includes('{{')) {
        expanded[key] = this.resolveTemplateValue(value, event, previousResults)
      } else if (Array.isArray(value)) {
        expanded[key] = value.map((item) =>
          typeof item === 'string' && item.includes('{{')
            ? this.resolveTemplateValue(item, event, previousResults)
            : item
        )
      } else if (value && typeof value === 'object') {
        expanded[key] = this.expandTemplateParameters(value, event, previousResults)
      } else {
        expanded[key] = value
      }
    }

    return expanded
  }

  private resolveTemplateValue(template: string, event: WorkflowEvent, previousResults: any[]): any {
    const match = template.match(/\{\{([^}]+)\}\}/)
    if (!match) return template

    const pathExpression = match[1].trim()
    if (pathExpression === 'action_result' || pathExpression === 'action_result.previous') {
      return previousResults.slice(-1)[0]?.result
    }

    const segments = pathExpression.split('.')
    let current: any

    if (segments[0] === 'config') {
      current = this.config
      segments.shift()
    } else if (segments[0] === 'action_result') {
      current = previousResults.slice(-1)[0]?.result
      segments.shift()
    } else {
      current = event.data || {}
      if (segments[0] === 'event') {
        current = event
        segments.shift()
      }
    }

    for (const segment of segments) {
      current = this.extractSegment(current, segment)
      if (current === undefined || current === null) break
    }

    return current ?? template
  }

  private extractSegment(target: any, segment: string): any {
    const arrayMatch = segment.match(/^([a-zA-Z0-9_]+)\[(\d+)\]$/)
    if (arrayMatch) {
      const [, key, index] = arrayMatch
      const value = target?.[key]
      return Array.isArray(value) ? value[Number(index)] : undefined
    }

    return target?.[segment]
  }

  private normalizeRepoParams(params: any): { owner: string; repo: string } {
    // If both owner and repo are already provided separately
    if (params.owner && params.repo) {
      return { owner: params.owner, repo: params.repo }
    }

    // If repo is provided as "owner/repo" format
    if (params.repo && typeof params.repo === 'string') {
      const parts = params.repo.split('/')
      if (parts.length === 2) {
        return { owner: parts[0].trim(), repo: parts[1].trim() }
      }
      throw new Error(
        `Invalid repo format: "${params.repo}". Expected "owner/repo" or separate owner and repo parameters.`
      )
    }

    throw new Error(
      'Repository parameters must include either "owner" and "repo" separately, or "repo" as "owner/repo" format.'
    )
  }

  private async executeGitHubAction(operation: string, params: any): Promise<any> {
    const repoParams = this.normalizeRepoParams(params)

    switch (operation) {
      case 'analyzeRepository':
        return await this.githubService.analyzeRepository(
          // End of Selection
          repoParams.owner,
          repoParams.repo
        )
      case 'createIssue':
        return await this.githubService.createIntelligentIssue(repoParams.owner, repoParams.repo, params.data)
      case 'commentOnPR':
        return await this.githubService.processPullRequest(repoParams.owner, repoParams.repo, Number(params.prNumber))
      default:
        throw new Error(`Unknown GitHub operation: ${operation}`)
    }
  }

  private async executeSlackAction(operation: string, params: any): Promise<any> {
    switch (operation) {
      case 'notifyRepositoryAnalysis':
        return await this.slackService.notifyRepositoryAnalysis(
          params.channel ?? this.config.defaultChannel,
          params.analysis
        )
      case 'notifyDeploymentStatus':
        return await this.slackService.notifyDeploymentStatus(params.channel ?? this.config.devChannel, params.status)
      case 'sendErrorAlert':
        return await this.slackService.sendErrorAlert(params.channel ?? this.config.devChannel, params.error)
      default:
        throw new Error(`Unknown Slack operation: ${operation}`)
    }
  }

  private async executeNikCLIAction(operation: string, params: any): Promise<any> {
    // Integration with main NikCLI functionality
    console.log(`Executing NikCLI action: ${operation}`, params)

    switch (operation) {
      case 'runAnalysis':
        return await this.taskMaster.generateTasksWithAI(`Analyze ${params.target} for ${params.purpose}`)
      case 'triggerDeployment':
        return { deploymentId: 'simulated', status: 'triggered' }
      default:
        throw new Error(`Unknown NikCLI operation: ${operation}`)
    }
  }

  private async executeAsyncAction(action: WorkflowAction, result: any): Promise<void> {
    // Background processing for async actions
    setImmediate(async () => {
      try {
        // Log or handle async action completion
        console.log(`Async action completed: ${action.operation}`)
      } catch (error) {
        console.error(`Error in async action: ${action.operation}`, error)
      }
    })
  }

  private async handleWorkflowError(workflow: WorkflowDefinition, error: Error, event: WorkflowEvent): Promise<void> {
    // Notify team of workflow errors
    await this.slackService.sendErrorAlert(this.config.devChannel, {
      title: 'Workflow Error',
      description: `Workflow "${workflow.name}" failed: ${error.message}`,
      severity: 'medium',
      context: {
        workflowId: workflow.id,
        eventType: event.type,
        error: error.stack,
      },
    })
  }

  // Public API Methods
  async registerWorkflow(workflow: WorkflowDefinition): Promise<void> {
    this.workflows.set(workflow.id, workflow)
    console.log(`✓ Registered workflow: ${workflow.name}`)
  }

  async enableWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId)
    if (workflow) {
      workflow.enabled = true
    }
  }

  async disableWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId)
    if (workflow) {
      workflow.enabled = false
    }
  }

  async triggerWorkflow(workflowId: string, context: any = {}): Promise<void> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    const event: WorkflowEvent = {
      type: 'manual_trigger',
      data: context,
      timestamp: Date.now(),
      source: 'manual',
    }

    await this.executeWorkflow(workflow, event)
  }

  getWorkflowStatus(): Array<{ id: string; name: string; enabled: boolean }> {
    return Array.from(this.workflows.values()).map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      enabled: workflow.enabled,
    }))
  }

  private async getSystemHealthStatus(): Promise<any> {
    // Mock implementation - integrate with actual health check system
    return {
      healthy: Math.random() > 0.1, // 90% healthy
      issues: ['CPU usage high', 'Memory pressure'],
      critical: Math.random() > 0.9, // 10% critical issues
    }
  }
}
