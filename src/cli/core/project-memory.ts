import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import chalk from 'chalk'
import { z } from 'zod'

// ⚡︎ Project Memory Schemas
const ProjectPreferences = z
  .object({
    // UI/UX Preferences
    ui: z
      .object({
        theme: z.enum(['dark', 'light', 'auto']).default('dark'),
        colorScheme: z.enum(['default', 'vibrant', 'minimal']).default('default'),
        showProgress: z.boolean().default(true),
        showTimestamps: z.boolean().default(false),
        compactMode: z.boolean().default(false),
        typingEffect: z.boolean().default(false),
      })
      .default({}),

    // AI Behavior Preferences
    ai: z
      .object({
        preferredModel: z.string().optional(),
        temperature: z.number().min(0).max(2).default(0.7),
        maxTokens: z.number().min(100).max(100000).default(4000),
        autoApprove: z.boolean().default(false),
        verbosity: z.enum(['quiet', 'normal', 'verbose']).default('normal'),
        explainActions: z.boolean().default(true),
        autoOptimize: z.boolean().default(true),
      })
      .default({}),

    // Development Preferences
    development: z
      .object({
        preferredEditor: z.string().default('code'),
        defaultBranch: z.string().default('main'),
        commitStyle: z.enum(['conventional', 'simple', 'detailed']).default('conventional'),
        testFramework: z.string().optional(),
        buildTool: z.string().optional(),
        packageManager: z.enum(['npm', 'yarn', 'pnpm', 'bun']).default('npm'),
        autoFormatCode: z.boolean().default(true),
        autoRunTests: z.boolean().default(false),
      })
      .default({}),

    // Tool Preferences
    tools: z
      .object({
        favoriteTools: z.array(z.string()).default([]),
        toolAliases: z.record(z.string()).default({}),
        autoSuggestion: z.boolean().default(true),
        smartCompletion: z.boolean().default(true),
        commandHistory: z.boolean().default(true),
        backgroundTasks: z.boolean().default(true),
      })
      .default({}),

    // Security Preferences
    security: z
      .object({
        requireApproval: z.array(z.string()).default(['rm', 'delete', 'deploy']),
        allowAutoInstall: z.boolean().default(false),
        allowNetworkAccess: z.boolean().default(true),
        allowFileWrite: z.boolean().default(true),
        sandboxMode: z.boolean().default(false),
      })
      .default({}),
  })
  .default({})

const ProjectContext = z.object({
  // Project Identification
  projectId: z.string(),
  projectPath: z.string(),
  projectName: z.string(),
  projectType: z.string().optional(),

  // Technology Stack
  framework: z.string().optional(),
  language: z.string().optional(),
  runtime: z.string().optional(),
  dependencies: z.array(z.string()).default([]),

  // Git Information
  gitRemote: z.string().optional(),
  gitBranch: z.string().optional(),
  lastCommit: z.string().optional(),

  // Usage Patterns
  commonCommands: z.array(z.string()).default([]),
  frequentFiles: z.array(z.string()).default([]),
  workingHours: z.array(z.number()).default([]),

  // Timestamps
  createdAt: z.number(),
  lastAccessed: z.number(),
  lastModified: z.number(),
})

const ProjectMemory = z.object({
  context: ProjectContext,
  preferences: ProjectPreferences,
  statistics: z
    .object({
      sessionsCount: z.number().default(0),
      totalTime: z.number().default(0),
      commandsExecuted: z.number().default(0),
      filesModified: z.number().default(0),
      errorsEncountered: z.number().default(0),
    })
    .default({}),

  // Learning Data
  learningData: z
    .object({
      successfulPatterns: z.array(z.string()).default([]),
      failedPatterns: z.array(z.string()).default([]),
      userFeedback: z
        .array(
          z.object({
            action: z.string(),
            feedback: z.enum(['positive', 'negative', 'neutral']),
            timestamp: z.number(),
          })
        )
        .default([]),
      adaptiveWeights: z.record(z.number()).default({}),
    })
    .default({}),
})

type ProjectPreferences = z.infer<typeof ProjectPreferences>
type ProjectContext = z.infer<typeof ProjectContext>
type ProjectMemory = z.infer<typeof ProjectMemory>

export class ProjectMemoryManager {
  private memoryCache = new Map<string, ProjectMemory>()
  private memoryDir: string
  private globalPreferences: ProjectPreferences | null = null
  private currentProjectId: string | null = null
  private sessionStartTime: number = Date.now()

  constructor() {
    this.memoryDir = join(homedir(), '.nikcli', 'projects')
    this.ensureMemoryDirectory()
    this.loadGlobalPreferences()
  }

  /**
   * 🎯 Initialize project memory for current directory
   */
  public async initializeProject(projectPath?: string): Promise<string> {
    const resolvedPath = resolve(projectPath || require('../utils/working-dir').getWorkingDirectory())
    const projectId = this.generateProjectId(resolvedPath)

    this.currentProjectId = projectId

    // Load or create project memory
    const memory = await this.loadOrCreateProjectMemory(projectId, resolvedPath)

    // Update last accessed
    memory.context.lastAccessed = Date.now()
    memory.statistics.sessionsCount++

    // Save updated memory
    await this.saveProjectMemory(projectId, memory)

    console.log(chalk.green(`📁 Project memory initialized: ${memory.context.projectName}`))

    return projectId
  }

  /**
   * 💾 Get current project memory
   */
  public getCurrentProject(): ProjectMemory | null {
    if (!this.currentProjectId) return null
    return this.memoryCache.get(this.currentProjectId) || null
  }

  /**
   * 🔨 Get effective preferences (project + global)
   */
  public getEffectivePreferences(): ProjectPreferences {
    const projectMemory = this.getCurrentProject()
    const projectPrefs: ProjectPreferences = projectMemory?.preferences || ProjectPreferences.parse({})
    const globalPrefs: ProjectPreferences = this.globalPreferences || ProjectPreferences.parse({})

    // Merge with project preferences taking priority
    return ProjectPreferences.parse({
      ui: { ...globalPrefs.ui, ...projectPrefs.ui },
      ai: { ...globalPrefs.ai, ...projectPrefs.ai },
      development: { ...globalPrefs.development, ...projectPrefs.development },
      tools: { ...globalPrefs.tools, ...projectPrefs.tools },
      security: { ...globalPrefs.security, ...projectPrefs.security },
    })
  }

  /**
   * 🎛️ Update project preferences
   */
  public async updatePreferences(
    updates: Partial<ProjectPreferences>,
    scope: 'project' | 'global' = 'project'
  ): Promise<void> {
    if (scope === 'global') {
      this.globalPreferences = ProjectPreferences.parse({
        ...this.globalPreferences,
        ...updates,
      })
      await this.saveGlobalPreferences()
    } else {
      const projectMemory = this.getCurrentProject()
      if (projectMemory) {
        projectMemory.preferences = ProjectPreferences.parse({
          ...projectMemory.preferences,
          ...updates,
        })
        await this.saveProjectMemory(this.currentProjectId!, projectMemory)
      }
    }
  }

  /**
   * 📊 Record usage statistics
   */
  public recordUsage(action: {
    type: 'command' | 'file_edit' | 'error' | 'success'
    details: string
    timestamp?: number
  }): void {
    const projectMemory = this.getCurrentProject()
    if (!projectMemory) return

    const timestamp = action.timestamp || Date.now()

    // Update statistics
    switch (action.type) {
      case 'command':
        projectMemory.statistics.commandsExecuted++

        // Track common commands
        if (!projectMemory.context.commonCommands.includes(action.details)) {
          projectMemory.context.commonCommands.push(action.details)

          // Keep only top 20 commands
          if (projectMemory.context.commonCommands.length > 20) {
            projectMemory.context.commonCommands = projectMemory.context.commonCommands.slice(-20)
          }
        }
        break

      case 'file_edit':
        projectMemory.statistics.filesModified++

        // Track frequent files
        if (!projectMemory.context.frequentFiles.includes(action.details)) {
          projectMemory.context.frequentFiles.push(action.details)

          // Keep only top 30 files
          if (projectMemory.context.frequentFiles.length > 30) {
            projectMemory.context.frequentFiles = projectMemory.context.frequentFiles.slice(-30)
          }
        }
        break

      case 'error':
        projectMemory.statistics.errorsEncountered++

        // Learn from failed patterns
        if (!projectMemory.learningData.failedPatterns.includes(action.details)) {
          projectMemory.learningData.failedPatterns.push(action.details)
        }
        break

      case 'success':
        // Learn from successful patterns
        if (!projectMemory.learningData.successfulPatterns.includes(action.details)) {
          projectMemory.learningData.successfulPatterns.push(action.details)
        }
        break
    }

    // Update working hours pattern
    const hour = new Date(timestamp).getHours()
    if (!projectMemory.context.workingHours.includes(hour)) {
      projectMemory.context.workingHours.push(hour)

      // Keep sorted and unique
      projectMemory.context.workingHours = [...new Set(projectMemory.context.workingHours)].sort()
    }

    // Update total time
    projectMemory.statistics.totalTime = Date.now() - this.sessionStartTime

    // Save asynchronously
    this.saveProjectMemoryAsync(this.currentProjectId!, projectMemory)
  }

  /**
   * 👍 Record user feedback for learning
   */
  public recordFeedback(action: string, feedback: 'positive' | 'negative' | 'neutral'): void {
    const projectMemory = this.getCurrentProject()
    if (!projectMemory) return

    projectMemory.learningData.userFeedback.push({
      action,
      feedback,
      timestamp: Date.now(),
    })

    // Keep only recent feedback (last 100)
    if (projectMemory.learningData.userFeedback.length > 100) {
      projectMemory.learningData.userFeedback = projectMemory.learningData.userFeedback.slice(-100)
    }

    // Update adaptive weights based on feedback
    this.updateAdaptiveWeights(projectMemory, action, feedback)

    this.saveProjectMemoryAsync(this.currentProjectId!, projectMemory)
  }

  /**
   * 🔍 Get smart suggestions based on memory
   */
  public getSmartSuggestions(context: { currentAction?: string; timeOfDay?: number; recentCommands?: string[] }): {
    commands: string[]
    tools: string[]
    tips: string[]
  } {
    const projectMemory = this.getCurrentProject()
    const preferences = this.getEffectivePreferences()

    if (!projectMemory) {
      return { commands: [], tools: [], tips: [] }
    }

    const suggestions: {
      commands: string[]
      tools: string[]
      tips: string[]
    } = {
      commands: [],
      tools: [],
      tips: [],
    }

    // Time-based suggestions
    if (context.timeOfDay) {
      const isWorkingHour = projectMemory.context.workingHours.includes(context.timeOfDay)
      if (isWorkingHour) {
        suggestions.commands.push(...projectMemory.context.commonCommands.slice(0, 3))
      }
    }

    // Pattern-based suggestions
    if (context.currentAction) {
      const successfulPatterns = projectMemory.learningData.successfulPatterns
        .filter((pattern) => pattern.includes(context.currentAction!))
        .slice(0, 2)

      suggestions.commands.push(...successfulPatterns)
    }

    // Preference-based tool suggestions
    if (preferences.tools.favoriteTools.length > 0) {
      suggestions.tools.push(...preferences.tools.favoriteTools.slice(0, 3))
    }

    // Smart tips based on usage patterns
    const tips = this.generateSmartTips(projectMemory, preferences)
    suggestions.tips.push(...tips)

    return suggestions
  }

  /**
   * 📈 Get project analytics
   */
  public getProjectAnalytics(): {
    productivity: number
    efficiency: number
    errorRate: number
    topCommands: Array<{ command: string; count: number }>
    topFiles: Array<{ file: string; count: number }>
    workingPattern: number[]
  } {
    const projectMemory = this.getCurrentProject()
    if (!projectMemory) {
      return {
        productivity: 0,
        efficiency: 0,
        errorRate: 0,
        topCommands: [],
        topFiles: [],
        workingPattern: [],
      }
    }

    const stats = projectMemory.statistics
    const totalActions = stats.commandsExecuted + stats.filesModified

    return {
      productivity: totalActions / Math.max(1, stats.sessionsCount),
      efficiency: totalActions / Math.max(1, stats.totalTime / (1000 * 60 * 60)), // per hour
      errorRate: stats.errorsEncountered / Math.max(1, totalActions),
      topCommands: this.getTopItems(projectMemory.context.commonCommands),
      topFiles: this.getTopItems(projectMemory.context.frequentFiles).map(({ command, count }) => ({
        file: command,
        count,
      })),
      workingPattern: projectMemory.context.workingHours,
    }
  }

  // Private Methods

  private generateProjectId(projectPath: string): string {
    return createHash('md5').update(projectPath).digest('hex').substring(0, 16)
  }

  private async loadOrCreateProjectMemory(projectId: string, projectPath: string): Promise<ProjectMemory> {
    const memoryFile = join(this.memoryDir, `${projectId}.json`)

    if (existsSync(memoryFile)) {
      try {
        const data = readFileSync(memoryFile, 'utf-8')
        const parsed = JSON.parse(data)
        const memory = ProjectMemory.parse(parsed)
        this.memoryCache.set(projectId, memory)
        return memory
      } catch (error) {
        console.warn(chalk.yellow(`Failed to load project memory: ${error}`))
      }
    }

    // Create new project memory
    const context = await this.analyzeProject(projectPath)
    const memory: ProjectMemory = {
      context: {
        ...context,
        projectId,
        projectPath,
        projectName: context.projectName || 'unknown',
        dependencies: context.dependencies || [],
        commonCommands: context.commonCommands || [],
        frequentFiles: context.frequentFiles || [],
        workingHours: context.workingHours || [],
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        lastModified: Date.now(),
      },
      preferences: ProjectPreferences.parse({}),
      statistics: {
        sessionsCount: 0,
        totalTime: 0,
        commandsExecuted: 0,
        filesModified: 0,
        errorsEncountered: 0,
      },
      learningData: {
        successfulPatterns: [],
        failedPatterns: [],
        userFeedback: [],
        adaptiveWeights: {},
      },
    }

    this.memoryCache.set(projectId, memory)
    return memory
  }

  private async analyzeProject(projectPath: string): Promise<Partial<ProjectContext>> {
    const context: Partial<ProjectContext> = {
      projectName: projectPath.split('/').pop() || 'unknown',
      projectPath,
      commonCommands: [],
      frequentFiles: [],
      workingHours: [],
      dependencies: [],
    }

    try {
      // Analyze package.json
      const packageJsonPath = join(projectPath, 'package.json')
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        context.projectName = packageJson.name || context.projectName
        context.projectType = 'node'

        // Determine framework
        if (packageJson.dependencies) {
          if (packageJson.dependencies.react) context.framework = 'react'
          else if (packageJson.dependencies.vue) context.framework = 'vue'
          else if (packageJson.dependencies.angular) context.framework = 'angular'
          else if (packageJson.dependencies.next) context.framework = 'nextjs'
          else if (packageJson.dependencies.express) context.framework = 'express'
        }

        context.dependencies = Object.keys(packageJson.dependencies || {})
      }

      // Analyze git repository
      try {
        const { execSync } = require('node:child_process')
        const gitRemote = execSync('git remote get-url origin', {
          cwd: projectPath,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()

        const gitBranch = execSync('git branch --show-current', {
          cwd: projectPath,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()

        context.gitRemote = gitRemote
        context.gitBranch = gitBranch
      } catch {
        // Not a git repository or git not available
      }

      // Determine primary language
      const files = require('node:fs').readdirSync(projectPath)
      if (files.some((f: string) => f.endsWith('.ts') || f.endsWith('.tsx'))) {
        context.language = 'typescript'
      } else if (files.some((f: string) => f.endsWith('.js') || f.endsWith('.jsx'))) {
        context.language = 'javascript'
      } else if (files.some((f: string) => f.endsWith('.py'))) {
        context.language = 'python'
      } else if (files.some((f: string) => f.endsWith('.java'))) {
        context.language = 'java'
      } else if (files.some((f: string) => f.endsWith('.go'))) {
        context.language = 'go'
      } else if (files.some((f: string) => f.endsWith('.rs'))) {
        context.language = 'rust'
      }
    } catch (error) {
      console.warn(chalk.yellow(`Failed to analyze project: ${error}`))
    }

    return context
  }

  private ensureMemoryDirectory(): void {
    const baseDir = dirname(this.memoryDir)
    if (!existsSync(baseDir)) {
      require('node:fs').mkdirSync(baseDir, { recursive: true })
    }
    if (!existsSync(this.memoryDir)) {
      require('node:fs').mkdirSync(this.memoryDir, { recursive: true })
    }
  }

  private async saveProjectMemory(projectId: string, memory: ProjectMemory): Promise<void> {
    try {
      const memoryFile = join(this.memoryDir, `${projectId}.json`)
      memory.context.lastModified = Date.now()
      writeFileSync(memoryFile, JSON.stringify(memory, null, 2))
      this.memoryCache.set(projectId, memory)
    } catch (error) {
      console.warn(chalk.yellow(`Failed to save project memory: ${error}`))
    }
  }

  private saveProjectMemoryAsync(projectId: string, memory: ProjectMemory): void {
    // Save asynchronously to avoid blocking
    setImmediate(() => {
      this.saveProjectMemory(projectId, memory)
    })
  }

  private loadGlobalPreferences(): void {
    try {
      const globalFile = join(dirname(this.memoryDir), 'global-preferences.json')
      if (existsSync(globalFile)) {
        const data = readFileSync(globalFile, 'utf-8')
        const parsed = JSON.parse(data)
        this.globalPreferences = ProjectPreferences.parse(parsed)
      }
    } catch (error) {
      console.warn(chalk.yellow(`Failed to load global preferences: ${error}`))
    }
  }

  private async saveGlobalPreferences(): Promise<void> {
    try {
      const globalFile = join(dirname(this.memoryDir), 'global-preferences.json')
      writeFileSync(globalFile, JSON.stringify(this.globalPreferences, null, 2))
    } catch (error) {
      console.warn(chalk.yellow(`Failed to save global preferences: ${error}`))
    }
  }

  private updateAdaptiveWeights(
    memory: ProjectMemory,
    action: string,
    feedback: 'positive' | 'negative' | 'neutral'
  ): void {
    const currentWeight = memory.learningData.adaptiveWeights[action] || 0

    switch (feedback) {
      case 'positive':
        memory.learningData.adaptiveWeights[action] = Math.min(1, currentWeight + 0.1)
        break
      case 'negative':
        memory.learningData.adaptiveWeights[action] = Math.max(-1, currentWeight - 0.1)
        break
      case 'neutral':
        // Slowly decay towards neutral
        memory.learningData.adaptiveWeights[action] = currentWeight * 0.9
        break
    }
  }

  private generateSmartTips(memory: ProjectMemory, _preferences: ProjectPreferences): string[] {
    const tips: string[] = []

    // Error rate tips
    const analytics = this.getProjectAnalytics()
    if (analytics.errorRate > 0.1) {
      tips.push('Consider running tests more frequently to catch errors early')
    }

    // Productivity tips
    if (analytics.productivity < 5) {
      tips.push('Try using keyboard shortcuts and command aliases to work faster')
    }

    // Framework-specific tips
    if (memory.context.framework === 'react') {
      tips.push('Use React DevTools for better debugging experience')
    }

    // Working pattern tips
    if (memory.context.workingHours.length > 0) {
      const peak = this.getMostActiveHour(memory.context.workingHours)
      tips.push(`You're most active around ${peak}:00 - consider scheduling important tasks then`)
    }

    return tips.slice(0, 3) // Return top 3 tips
  }

  private getTopItems(items: string[]): Array<{ command: string; count: number }> {
    const counts = new Map<string, number>()
    items.forEach((item) => {
      counts.set(item, (counts.get(item) || 0) + 1)
    })

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([command, count]) => ({ command, count }))
  }

  private getMostActiveHour(hours: number[]): number {
    const counts = new Map<number, number>()
    hours.forEach((hour) => {
      counts.set(hour, (counts.get(hour) || 0) + 1)
    })

    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 9
  }

  /**
   * 🧹 Cleanup old project memories
   */
  public cleanupOldMemories(maxAge: number = 90 * 24 * 60 * 60 * 1000): void {
    try {
      const files = require('node:fs').readdirSync(this.memoryDir)
      const now = Date.now()

      files.forEach((file: string) => {
        if (file.endsWith('.json')) {
          const filePath = join(this.memoryDir, file)
          const stat = statSync(filePath)

          if (now - stat.mtime.getTime() > maxAge) {
            require('node:fs').unlinkSync(filePath)
            console.log(chalk.dim(`Cleaned up old project memory: ${file}`))
          }
        }
      })
    } catch (error) {
      console.warn(chalk.yellow(`Failed to cleanup old memories: ${error}`))
    }
  }

  /**
   * 📊 Export project data
   */
  public exportProjectData(): any {
    const projectMemory = this.getCurrentProject()
    if (!projectMemory) return null

    return {
      ...projectMemory,
      exportedAt: Date.now(),
      version: '1.0',
    }
  }
}

export const projectMemory = new ProjectMemoryManager()
