import { EventEmitter } from 'node:events'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ExecutionOutcome, UserPreferences } from './types/orchestrator-types'

const PREFERENCES_FILE = '.nikcli/user-preferences.json'

const DEFAULT_PREFERENCES: UserPreferences = {
  preferredAgentCount: 2,
  preferredPlanSize: 5,
  contextVerbosity: 'standard',
  maxContextTokens: 40000,
  sharedContextRatio: 0.3,
  toolSelectionPreference: [],
  autoToolSelection: true,
  parallelExecution: true,
  maxParallelAgents: 3,
  lastUpdated: new Date().toISOString(),
  version: '1.0.0',
  learningStats: {
    totalDecisions: 0,
    successfulDecisions: 0,
    successRate: 0.5,
  },
}

export class UserPreferenceManager extends EventEmitter {
  private preferencesFile: string
  private preferences: UserPreferences
  private dirty: boolean = false
  private saveInterval: NodeJS.Timeout | null = null
  private initPromise: Promise<void> | null = null

  constructor() {
    super()
    this.preferencesFile = path.join(os.homedir(), PREFERENCES_FILE)
    this.initPromise = this.initialize()
  }

  private async initialize(): Promise<void> {
    this.preferences = await this.loadPreferences()
    this.setupAutoSave()
  }

  private async loadPreferences(): Promise<UserPreferences> {
    try {
      const data = await fs.readFile(this.preferencesFile, 'utf-8')
      const parsed = JSON.parse(data)
      return this.mergePreferences(DEFAULT_PREFERENCES, parsed)
    } catch {
      return { ...DEFAULT_PREFERENCES }
    }
  }

  private mergePreferences(defaults: UserPreferences, loaded: Partial<UserPreferences>): UserPreferences {
    const result = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof UserPreferences)[]) {
      if (loaded[key] !== undefined) {
        if (key === 'learningStats' && typeof loaded[key] === 'object') {
          result[key] = { ...defaults[key], ...loaded[key] } as UserPreferences['learningStats']
        } else {
          ;(result as any)[key] = loaded[key]
        }
      }
    }
    return result
  }

  private async savePreferences(): Promise<void> {
    if (!this.dirty || !this.preferences) return

    try {
      const dir = path.dirname(this.preferencesFile)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(this.preferencesFile, JSON.stringify(this.preferences, null, 2))
      this.dirty = false
      this.emit('saved', this.preferences)
    } catch (error) {
      this.emit('error', error)
    }
  }

  private setupAutoSave(): void {
    this.saveInterval = setInterval(() => {
      this.savePreferences()
    }, 30000)
  }

  async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise
    }
  }

  getPreferredAgentCount(): number {
    return this.preferences?.preferredAgentCount ?? DEFAULT_PREFERENCES.preferredAgentCount
  }

  getPreferredPlanSize(): number {
    return this.preferences?.preferredPlanSize ?? DEFAULT_PREFERENCES.preferredPlanSize
  }

  getContextVerbosity(): UserPreferences['contextVerbosity'] {
    return this.preferences?.contextVerbosity ?? DEFAULT_PREFERENCES.contextVerbosity
  }

  getMaxContextTokens(): number {
    return this.preferences?.maxContextTokens ?? DEFAULT_PREFERENCES.maxContextTokens
  }

  getSharedContextRatio(): number {
    return this.preferences?.sharedContextRatio ?? DEFAULT_PREFERENCES.sharedContextRatio
  }

  getParallelExecutionEnabled(): boolean {
    return (
      (this.preferences?.parallelExecution ?? DEFAULT_PREFERENCES.parallelExecution) &&
      (this.preferences?.maxParallelAgents ?? DEFAULT_PREFERENCES.maxParallelAgents) > 1
    )
  }

  getMaxParallelAgents(): number {
    return this.preferences?.maxParallelAgents ?? DEFAULT_PREFERENCES.maxParallelAgents
  }

  getAutoToolSelection(): boolean {
    return this.preferences?.autoToolSelection ?? DEFAULT_PREFERENCES.autoToolSelection
  }

  getToolSelectionPreference(): string[] {
    return this.preferences?.toolSelectionPreference ?? DEFAULT_PREFERENCES.toolSelectionPreference
  }

  getAllPreferences(): UserPreferences {
    return { ...this.preferences }
  }

  updateAgentCount(count: number): void {
    if (!this.preferences) return
    this.preferences.preferredAgentCount = Math.max(1, Math.min(10, Math.round(count)))
    this.dirty = true
    this.emit('preferenceChanged', 'preferredAgentCount', this.preferences.preferredAgentCount)
  }

  updatePlanSize(size: number): void {
    if (!this.preferences) return
    this.preferences.preferredPlanSize = Math.max(1, Math.min(20, Math.round(size)))
    this.dirty = true
    this.emit('preferenceChanged', 'preferredPlanSize', this.preferences.preferredPlanSize)
  }

  updateContextVerbosity(verbosity: UserPreferences['contextVerbosity']): void {
    if (!this.preferences) return
    this.preferences.contextVerbosity = verbosity
    this.dirty = true
    this.emit('preferenceChanged', 'contextVerbosity', verbosity)
  }

  updateMaxContextTokens(tokens: number): void {
    if (!this.preferences) return
    this.preferences.maxContextTokens = Math.max(10000, Math.min(100000, Math.round(tokens)))
    this.dirty = true
    this.emit('preferenceChanged', 'maxContextTokens', this.preferences.maxContextTokens)
  }

  updateSharedContextRatio(ratio: number): void {
    if (!this.preferences) return
    this.preferences.sharedContextRatio = Math.max(0.1, Math.min(0.9, ratio))
    this.dirty = true
    this.emit('preferenceChanged', 'sharedContextRatio', this.preferences.sharedContextRatio)
  }

  updateParallelExecution(enabled: boolean): void {
    if (!this.preferences) return
    this.preferences.parallelExecution = enabled
    this.dirty = true
    this.emit('preferenceChanged', 'parallelExecution', enabled)
  }

  updateMaxParallelAgents(count: number): void {
    if (!this.preferences) return
    this.preferences.maxParallelAgents = Math.max(1, Math.min(5, Math.round(count)))
    this.dirty = true
    this.emit('preferenceChanged', 'maxParallelAgents', this.preferences.maxParallelAgents)
  }

  async recordOutcome(outcome: ExecutionOutcome): Promise<void> {
    if (!this.preferences) {
      await this.ensureInitialized()
    }

    if (!this.preferences) return

    this.preferences.learningStats.totalDecisions++
    if (outcome.success) {
      this.preferences.learningStats.successfulDecisions++
    }
    this.preferences.learningStats.successRate =
      this.preferences.learningStats.successfulDecisions / this.preferences.learningStats.totalDecisions

    const efficiencyAdjustment = this.calculateEfficiencyAdjustment(outcome)
    if (efficiencyAdjustment !== 0) {
      const currentCount = this.preferences.preferredAgentCount
      const newCount = Math.max(1, Math.min(10, currentCount + efficiencyAdjustment))
      if (newCount !== currentCount) {
        this.preferences.preferredAgentCount = newCount
        this.emit('preferenceChanged', 'preferredAgentCount', newCount)
      }
    }

    if (outcome.contextTokensUsed > outcome.contextBudget * 0.95) {
      const currentTokens = this.preferences.maxContextTokens
      const adjustedTokens = Math.min(100000, Math.round(currentTokens * 1.1))
      if (adjustedTokens !== currentTokens) {
        this.preferences.maxContextTokens = adjustedTokens
        this.emit('preferenceChanged', 'maxContextTokens', adjustedTokens)
      }
    }

    if (outcome.contextTokensUsed < outcome.contextBudget * 0.5 && outcome.success) {
      const currentTokens = this.preferences.maxContextTokens
      const adjustedTokens = Math.max(10000, Math.round(currentTokens * 0.9))
      if (adjustedTokens !== currentTokens) {
        this.preferences.maxContextTokens = adjustedTokens
        this.emit('preferenceChanged', 'maxContextTokens', adjustedTokens)
      }
    }

    this.preferences.lastUpdated = new Date().toISOString()
    this.dirty = true

    this.emit('outcomeRecorded', outcome)
  }

  private calculateEfficiencyAdjustment(outcome: ExecutionOutcome): number {
    const efficiency = outcome.efficiencyRatio
    const complexity = outcome.complexityScore

    if (outcome.success && efficiency > 0.85) {
      if (complexity > 60) {
        return 0.15
      } else if (complexity > 40) {
        return 0.1
      }
      return 0.05
    } else if (!outcome.success || efficiency < 0.5) {
      if (complexity > 60) {
        return -0.2
      } else if (complexity > 40) {
        return -0.15
      }
      return -0.1
    }
    return 0
  }

  exportPreferences(): string {
    return JSON.stringify(this.preferences, null, 2)
  }

  async importPreferences(jsonString: string): Promise<void> {
    await this.ensureInitialized()
    const parsed = JSON.parse(jsonString)
    this.preferences = this.mergePreferences(this.preferences, parsed)
    this.dirty = true
    this.emit('preferencesImported', this.preferences)
  }

  getLearningStats(): UserPreferences['learningStats'] {
    return this.preferences?.learningStats ?? DEFAULT_PREFERENCES.learningStats
  }

  async cleanup(): Promise<void> {
    if (this.saveInterval) {
      clearInterval(this.saveInterval)
      this.saveInterval = null
    }
    await this.savePreferences()
  }
}

export const userPreferenceManager = new UserPreferenceManager()
