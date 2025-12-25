/**
 * Claude Agent SDK Provider
 *
 * Integrates @anthropic-ai/claude-agent-sdk with NikCLI
 * Provides skills, subagents, and autonomous execution capabilities
 */

import { EventEmitter } from 'node:events'
import { query } from '@anthropic-ai/claude-agent-sdk'
import chalk from 'chalk'
import { simpleConfigManager } from '../core/config-manager'
import { advancedUI } from '../ui/advanced-cli-ui'

// ====================== TYPES ======================

export interface ClaudeAgentConfig {
  enabled: boolean
  model: 'opus' | 'sonnet' | 'haiku'
  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  maxTurns: number
  maxBudgetUsd: number
  streamOutput: boolean
  showThinking: boolean
}

export interface SkillDefinition {
  name: string
  description: string
  tools: string[]
  prompt: string
  category: 'file' | 'code' | 'test' | 'refactor' | 'deploy' | 'custom'
  riskLevel: 'low' | 'medium' | 'high'
}

export interface SubagentDefinition {
  name: string
  description: string
  prompt: string
  tools: string[]
  model?: 'opus' | 'sonnet' | 'haiku'
}

export interface AgentSession {
  id: string
  prompt: string
  startedAt: Date
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  skillName?: string
}

export interface StreamEvent {
  type: 'start' | 'thinking' | 'tool_call' | 'tool_result' | 'text_delta' | 'complete' | 'error'
  content?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  sessionId?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  costUsd?: number
}

export interface SkillExecutionResult {
  success: boolean
  output: string
  reasoning?: string[]
  toolsCalled: string[]
  tokensUsed: number
  costUsd: number
  duration: number
}

// ====================== BUILT-IN SKILLS ======================

const BUILTIN_SKILLS: Record<string, SkillDefinition> = {
  'file-management': {
    name: 'file-management',
    description: 'Complex file operations: batch read, search, replace, organize',
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    prompt: `You are a file management specialist. Execute file operations efficiently:
- Use Glob to find files matching patterns
- Use Grep to search content within files
- Use Read to examine file contents
- Use Edit for precise modifications
- Use Write for creating new files
Always verify operations before executing and report results clearly.`,
    category: 'file',
    riskLevel: 'medium',
  },

  'code-analysis': {
    name: 'code-analysis',
    description: 'Static code analysis: security, performance, quality, patterns',
    tools: ['Read', 'Grep', 'Glob'],
    prompt: `You are a code analysis expert. Analyze code for:
- Security vulnerabilities (injection, XSS, auth issues)
- Performance bottlenecks (N+1 queries, memory leaks, blocking ops)
- Code quality (complexity, duplication, naming)
- Best practices and patterns
Provide actionable recommendations with file:line references.`,
    category: 'code',
    riskLevel: 'low',
  },

  refactoring: {
    name: 'refactoring',
    description: 'Assisted refactoring: rename, extract, restructure, modernize',
    tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
    prompt: `You are a refactoring specialist. Perform safe refactoring:
- Rename variables/functions/classes consistently
- Extract methods/components
- Restructure code for clarity
- Modernize patterns and syntax
Always search for all usages before renaming. Make atomic changes.`,
    category: 'refactor',
    riskLevel: 'medium',
  },

  'test-generation': {
    name: 'test-generation',
    description: 'Generate tests: unit, integration, e2e, coverage analysis',
    tools: ['Read', 'Write', 'Glob', 'Bash'],
    prompt: `You are a testing expert. Generate comprehensive tests:
- Analyze existing code to understand functionality
- Create unit tests for individual functions/methods
- Create integration tests for module interactions
- Follow existing test patterns in the codebase
- Use appropriate testing framework (vitest, jest, etc.)
Run tests after generation to verify they pass.`,
    category: 'test',
    riskLevel: 'low',
  },
}

// ====================== BUILT-IN SUBAGENTS ======================

const BUILTIN_SUBAGENTS: Record<string, SubagentDefinition> = {
  'code-reviewer': {
    name: 'code-reviewer',
    description: 'Expert code review specialist for security and quality',
    prompt: `You are an expert code reviewer. Focus on:
- Security vulnerabilities
- Performance issues
- Code maintainability
- Best practices
Provide specific, actionable feedback with line references.`,
    tools: ['Read', 'Grep', 'Glob'],
    model: 'sonnet',
  },

  'test-runner': {
    name: 'test-runner',
    description: 'Runs test suites and analyzes results',
    prompt: `You are a test execution specialist. Execute tests and analyze results:
- Run test commands (npm test, vitest, jest, etc.)
- Parse test output for failures
- Identify flaky tests
- Report coverage gaps`,
    tools: ['Bash', 'Read', 'Grep'],
    model: 'haiku',
  },

  'doc-generator': {
    name: 'doc-generator',
    description: 'Generates documentation from code',
    prompt: `You are a documentation specialist. Generate clear documentation:
- Extract function signatures and types
- Write clear descriptions
- Add usage examples
- Follow existing doc patterns`,
    tools: ['Read', 'Write', 'Glob'],
    model: 'sonnet',
  },
}

// ====================== PROVIDER CLASS ======================

export class ClaudeAgentProvider extends EventEmitter {
  private config: ClaudeAgentConfig
  private activeSessions: Map<string, AgentSession> = new Map()
  private skills: Map<string, SkillDefinition> = new Map()
  private subagents: Map<string, SubagentDefinition> = new Map()
  private workingDirectory: string

  constructor() {
    super()
    this.workingDirectory = process.cwd()

    this.config = {
      enabled: true,
      model: 'sonnet',
      permissionMode: 'acceptEdits',
      maxTurns: 50,
      maxBudgetUsd: 5.0,
      streamOutput: true,
      showThinking: true,
    }

    this.initialize()
  }

  private initialize(): void {
    advancedUI.logFunctionCall('claudeagentproviderinit')

    // Register built-in skills
    for (const [name, skill] of Object.entries(BUILTIN_SKILLS)) {
      this.skills.set(name, skill)
    }

    // Register built-in subagents
    for (const [name, agent] of Object.entries(BUILTIN_SUBAGENTS)) {
      this.subagents.set(name, agent)
    }

    // Load config from settings (using generic storage)
    try {
      const savedConfig = simpleConfigManager.get('customProviders' as any)?.claudeAgent as
        | Partial<ClaudeAgentConfig>
        | undefined
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig }
      }
    } catch {
      // Config not available, use defaults
    }

    advancedUI.logFunctionUpdate(
      'success',
      `Claude Agent SDK initialized (${this.skills.size} skills, ${this.subagents.size} subagents)`,
      '⚡'
    )
    this.emit('initialized', { skills: this.skills.size, subagents: this.subagents.size })
  }

  // ====================== SKILL EXECUTION ======================

  async *executeSkill(
    skillName: string,
    context: Record<string, unknown> = {}
  ): AsyncGenerator<StreamEvent, SkillExecutionResult> {
    const skill = this.skills.get(skillName)
    if (!skill) {
      throw new Error(`Skill '${skillName}' not found. Available: ${[...this.skills.keys()].join(', ')}`)
    }

    const sessionId = `skill-${Date.now()}`
    const startTime = Date.now()
    const reasoning: string[] = []
    const toolsCalled: string[] = []

    this.activeSessions.set(sessionId, {
      id: sessionId,
      prompt: skill.prompt,
      startedAt: new Date(),
      status: 'running',
      skillName,
    })

    yield { type: 'start', sessionId, content: `Executing skill: ${skill.name}` }
    this.emit('skill_start', { skillName, sessionId })

    try {
      const contextPrompt = Object.entries(context)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n')

      const fullPrompt = `${skill.prompt}\n\n## Context:\n${contextPrompt || 'No additional context provided.'}`

      let finalResult = ''
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      let costUsd = 0

      for await (const message of query({
        prompt: fullPrompt,
        options: {
          allowedTools: skill.tools,
          model: this.config.model,
          cwd: this.workingDirectory,
          permissionMode: this.config.permissionMode,
          maxTurns: this.config.maxTurns,
          maxBudgetUsd: this.config.maxBudgetUsd,
        },
      })) {
        const msg = message as any
        if (msg.type === 'assistant') {
          const content = msg.message?.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text') {
                finalResult += block.text
                yield { type: 'text_delta', content: block.text, sessionId }
              } else if (block.type === 'thinking') {
                reasoning.push(block.thinking)
                yield { type: 'thinking', content: block.thinking, sessionId }
              } else if (block.type === 'tool_use') {
                toolsCalled.push(block.name)
                yield {
                  type: 'tool_call',
                  toolName: block.name,
                  toolArgs: block.input as Record<string, unknown>,
                  sessionId,
                }
              }
            }
          }
        } else if (msg.type === 'result') {
          const u = msg.usage
          if (u) {
            usage = {
              promptTokens: u.input_tokens || u.promptTokens || 0,
              completionTokens: u.output_tokens || u.completionTokens || 0,
              totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0) || u.totalTokens || 0,
            }
          }
          costUsd = msg.total_cost_usd || 0
          finalResult = msg.result || msg.text || finalResult
        }
      }

      const session = this.activeSessions.get(sessionId)
      if (session) {
        session.status = 'completed'
      }

      yield { type: 'complete', sessionId, usage, costUsd }
      this.emit('skill_complete', { skillName, sessionId, success: true })

      return {
        success: true,
        output: finalResult,
        reasoning,
        toolsCalled,
        tokensUsed: usage.totalTokens,
        costUsd,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      const session = this.activeSessions.get(sessionId)
      if (session) {
        session.status = 'failed'
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      yield { type: 'error', content: errorMessage, sessionId }
      this.emit('skill_error', { skillName, sessionId, error: errorMessage })

      return {
        success: false,
        output: errorMessage,
        reasoning,
        toolsCalled,
        tokensUsed: 0,
        costUsd: 0,
        duration: Date.now() - startTime,
      }
    }
  }

  // ====================== AGENT EXECUTION ======================

  async *executeAgent(
    prompt: string,
    options: {
      tools?: string[]
      subagents?: string[]
      model?: 'opus' | 'sonnet' | 'haiku'
    } = {}
  ): AsyncGenerator<StreamEvent, SkillExecutionResult> {
    const sessionId = `agent-${Date.now()}`
    const startTime = Date.now()
    const reasoning: string[] = []
    const toolsCalled: string[] = []

    this.activeSessions.set(sessionId, {
      id: sessionId,
      prompt,
      startedAt: new Date(),
      status: 'running',
    })

    yield { type: 'start', sessionId, content: 'Starting Claude Agent' }
    this.emit('agent_start', { sessionId, prompt })

    try {
      // Build subagent definitions if specified
      const agents: Record<string, any> = {}

      for (const name of options.subagents || []) {
        const subagent = this.subagents.get(name)
        if (subagent) {
          agents[name] = {
            description: subagent.description,
            prompt: subagent.prompt,
            tools: subagent.tools,
            model: subagent.model as 'opus' | 'sonnet' | 'haiku' | 'inherit' | undefined,
          }
        }
      }

      let finalResult = ''
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      let costUsd = 0

      for await (const message of query({
        prompt,
        options: {
          allowedTools: options.tools || ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'Task'],
          model: options.model || this.config.model,
          cwd: this.workingDirectory,
          permissionMode: this.config.permissionMode,
          maxTurns: this.config.maxTurns,
          maxBudgetUsd: this.config.maxBudgetUsd,
          agents: Object.keys(agents).length > 0 ? agents : undefined,
        },
      })) {
        const msg = message as any
        if (msg.type === 'assistant') {
          const content = msg.message?.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text') {
                finalResult += block.text
                yield { type: 'text_delta', content: block.text, sessionId }
              } else if (block.type === 'thinking') {
                reasoning.push(block.thinking)
                yield { type: 'thinking', content: block.thinking, sessionId }
              } else if (block.type === 'tool_use') {
                toolsCalled.push(block.name)
                yield {
                  type: 'tool_call',
                  toolName: block.name,
                  toolArgs: block.input as Record<string, unknown>,
                  sessionId,
                }
              }
            }
          }
        } else if (msg.type === 'result') {
          const u = msg.usage
          if (u) {
            usage = {
              promptTokens: u.input_tokens || u.promptTokens || 0,
              completionTokens: u.output_tokens || u.completionTokens || 0,
              totalTokens: (u.input_tokens || 0) + (u.output_tokens || 0) || u.totalTokens || 0,
            }
          }
          costUsd = msg.total_cost_usd || 0
          finalResult = msg.result || msg.text || finalResult
        }
      }

      const session = this.activeSessions.get(sessionId)
      if (session) {
        session.status = 'completed'
      }

      yield { type: 'complete', sessionId, usage, costUsd }
      this.emit('agent_complete', { sessionId, success: true })

      return {
        success: true,
        output: finalResult,
        reasoning,
        toolsCalled,
        tokensUsed: usage.totalTokens,
        costUsd,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      const session = this.activeSessions.get(sessionId)
      if (session) {
        session.status = 'failed'
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      yield { type: 'error', content: errorMessage, sessionId }
      this.emit('agent_error', { sessionId, error: errorMessage })

      return {
        success: false,
        output: errorMessage,
        reasoning,
        toolsCalled,
        tokensUsed: 0,
        costUsd: 0,
        duration: Date.now() - startTime,
      }
    }
  }

  // ====================== SKILL MANAGEMENT ======================

  registerSkill(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill)
    this.emit('skill_registered', skill)
  }

  removeSkill(name: string): boolean {
    const removed = this.skills.delete(name)
    if (removed) {
      this.emit('skill_removed', { name })
    }
    return removed
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.skills.get(name)
  }

  listSkills(): SkillDefinition[] {
    return [...this.skills.values()]
  }

  listSkillsByCategory(category: SkillDefinition['category']): SkillDefinition[] {
    return [...this.skills.values()].filter((s) => s.category === category)
  }

  // ====================== SUBAGENT MANAGEMENT ======================

  registerSubagent(subagent: SubagentDefinition): void {
    this.subagents.set(subagent.name, subagent)
    this.emit('subagent_registered', subagent)
  }

  removeSubagent(name: string): boolean {
    const removed = this.subagents.delete(name)
    if (removed) {
      this.emit('subagent_removed', { name })
    }
    return removed
  }

  getSubagent(name: string): SubagentDefinition | undefined {
    return this.subagents.get(name)
  }

  listSubagents(): SubagentDefinition[] {
    return [...this.subagents.values()]
  }

  // ====================== SESSION MANAGEMENT ======================

  getActiveSessions(): AgentSession[] {
    return [...this.activeSessions.values()].filter((s) => s.status === 'running')
  }

  getSession(id: string): AgentSession | undefined {
    return this.activeSessions.get(id)
  }

  cancelSession(id: string): boolean {
    const session = this.activeSessions.get(id)
    if (session && session.status === 'running') {
      session.status = 'cancelled'
      this.emit('session_cancelled', { id })
      return true
    }
    return false
  }

  // ====================== CONFIG MANAGEMENT ======================

  getConfig(): ClaudeAgentConfig {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<ClaudeAgentConfig>): void {
    this.config = { ...this.config, ...newConfig }
    // Store in customProviders section
    try {
      const customProviders = simpleConfigManager.get('customProviders' as any) || {}
      simpleConfigManager.set('customProviders' as any, { ...customProviders, claudeAgent: this.config })
    } catch {
      // Config persistence not available
    }
    this.emit('config_updated', this.config)
  }

  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir
  }

  // ====================== UTILITY ======================

  formatSkillOutput(result: SkillExecutionResult): string {
    const lines: string[] = []

    if (result.success) {
      lines.push(chalk.green('✓ Skill executed successfully'))
    } else {
      lines.push(chalk.red('✖ Skill execution failed'))
    }

    lines.push('')
    lines.push(result.output)

    if (result.reasoning && result.reasoning.length > 0 && this.config.showThinking) {
      lines.push('')
      lines.push(chalk.gray('─── Reasoning ───'))
      for (const r of result.reasoning) {
        lines.push(chalk.gray(`  ${r.substring(0, 200)}${r.length > 200 ? '...' : ''}`))
      }
    }

    if (result.toolsCalled.length > 0) {
      lines.push('')
      lines.push(chalk.gray(`Tools used: ${result.toolsCalled.join(', ')}`))
    }

    lines.push(
      chalk.gray(
        `Duration: ${(result.duration / 1000).toFixed(2)}s | Tokens: ${result.tokensUsed} | Cost: $${result.costUsd.toFixed(4)}`
      )
    )

    return lines.join('\n')
  }
}

// ====================== SINGLETON EXPORT ======================

export const claudeAgentProvider = new ClaudeAgentProvider()
