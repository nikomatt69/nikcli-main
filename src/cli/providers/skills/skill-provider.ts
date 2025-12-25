/**
 * Anthropic Skills Provider
 *
 * Integrates https://github.com/anthropics/skills with NikCLI
 * Loads, parses, caches and manages skills from Anthropic's official repository
 */

import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import chalk from 'chalk'
import * as yaml from 'js-yaml'
import { advancedUI } from '../../ui/advanced-cli-ui'
import { claudeAgentProvider, type SkillDefinition } from '../claude-agents'

// ====================== TYPES ======================

export interface AnthropicSkillMetadata {
  name: string
  description: string
  version?: string
  author?: string
  tags?: string[]
  dependencies?: string[]
}

export interface AnthropicSkill {
  metadata: AnthropicSkillMetadata
  instructions: string
  rawContent: string
  source: 'local' | 'remote' | 'builtin'
  cachedAt?: Date
}

export interface SkillProviderConfig {
  enabled: boolean
  cacheDir: string
  repoOwner: string
  repoName: string
  branch: string
  autoSync: boolean
  cacheTtlMs: number
}

// ====================== CONSTANTS ======================

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com'
const GITHUB_API_BASE = 'https://api.github.com'
const DEFAULT_CACHE_DIR = '.nikcli/skills'

const KNOWN_SKILLS = ['docx', 'pdf', 'pptx', 'xlsx'] as const

// ====================== PROVIDER CLASS ======================

export class SkillProvider extends EventEmitter {
  private config: SkillProviderConfig
  private skills: Map<string, AnthropicSkill> = new Map()
  private cacheDir: string
  private eventHandlers: Map<string, Function[]> = new Map()

  constructor() {
    super()

    this.config = {
      enabled: true,
      cacheDir: DEFAULT_CACHE_DIR,
      repoOwner: 'anthropics',
      repoName: 'skills',
      branch: 'main',
      autoSync: false,
      cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
    }

    this.cacheDir = resolve(process.cwd(), this.config.cacheDir)
    this.initialize()
  }

  private initialize(): void {
    advancedUI.logFunctionCall('skillproviderinit')

    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
    }

    // Load cached skills
    this.loadCachedSkills()

    advancedUI.logFunctionUpdate('success', `Skill Provider initialized (${this.skills.size} skills loaded)`, '🎯')
    this.emit('initialized', { skillCount: this.skills.size })

    // Register cleanup on process exit
    const cleanupHandler = () => this.cleanup()
    process.on('SIGTERM', cleanupHandler)
    process.on('SIGINT', cleanupHandler)
    this.eventHandlers.set('process_cleanup', [cleanupHandler])
  }

  // ====================== SKILL LOADING ======================

  /**
   * Load a skill from a local SKILL.md file
   */
  async loadSkillFromFile(filePath: string): Promise<AnthropicSkill> {
    const absolutePath = resolve(filePath)

    if (!existsSync(absolutePath)) {
      throw new Error(`Skill file not found: ${absolutePath}`)
    }

    const content = readFileSync(absolutePath, 'utf-8')
    const skill = this.parseSkillMd(content, 'local')

    this.skills.set(skill.metadata.name, skill)
    this.registerWithClaudeAgent(skill)
    this.emit('skill_loaded', { name: skill.metadata.name, source: 'local' })

    return skill
  }

  /**
   * Load a skill from the Anthropic skills repository
   */
  async loadSkillFromRepo(skillName: string): Promise<AnthropicSkill> {
    // Check cache first
    const cached = this.getCachedSkill(skillName)
    if (cached && !this.isCacheExpired(cached)) {
      console.log(chalk.gray(`📦 Using cached skill: ${skillName}`))
      return cached
    }

    const url = `${GITHUB_RAW_BASE}/${this.config.repoOwner}/${this.config.repoName}/${this.config.branch}/skills/${skillName}/SKILL.md`

    console.log(chalk.blue(`⬇️  Fetching skill: ${skillName}`))

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch skill '${skillName}': ${response.status} ${response.statusText}`)
    }

    const content = await response.text()
    const skill = this.parseSkillMd(content, 'remote')

    // Override name if different
    if (!skill.metadata.name || skill.metadata.name !== skillName) {
      skill.metadata.name = skillName
    }

    skill.cachedAt = new Date()

    // Cache and register
    this.cacheSkill(skill)
    this.skills.set(skill.metadata.name, skill)
    this.registerWithClaudeAgent(skill)

    console.log(chalk.green(`✓ Skill loaded: ${skillName}`))
    this.emit('skill_loaded', { name: skill.metadata.name, source: 'remote' })

    return skill
  }

  /**
   * Install a skill (alias for loadSkillFromRepo with caching)
   */
  async installSkill(skillName: string): Promise<AnthropicSkill> {
    return this.loadSkillFromRepo(skillName)
  }

  /**
   * Parse SKILL.md content into AnthropicSkill object
   */
  parseSkillMd(content: string, source: 'local' | 'remote' | 'builtin'): AnthropicSkill {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

    if (!frontmatterMatch) {
      throw new Error('Invalid SKILL.md format: missing YAML frontmatter')
    }

    const [, yamlContent, instructions] = frontmatterMatch
    const metadata = yaml.load(yamlContent) as AnthropicSkillMetadata

    if (!metadata.name || !metadata.description) {
      throw new Error('Invalid SKILL.md: name and description are required in frontmatter')
    }

    return {
      metadata,
      instructions: instructions.trim(),
      rawContent: content,
      source,
    }
  }

  // ====================== CACHE MANAGEMENT ======================

  private getCacheFilePath(skillName: string): string {
    return join(this.cacheDir, `${skillName}.json`)
  }

  private getCachedSkill(skillName: string): AnthropicSkill | null {
    const cacheFile = this.getCacheFilePath(skillName)
    if (!existsSync(cacheFile)) return null

    try {
      const data = JSON.parse(readFileSync(cacheFile, 'utf-8'))
      data.cachedAt = new Date(data.cachedAt)
      return data as AnthropicSkill
    } catch {
      return null
    }
  }

  private isCacheExpired(skill: AnthropicSkill): boolean {
    if (!skill.cachedAt) return true
    const age = Date.now() - skill.cachedAt.getTime()
    return age > this.config.cacheTtlMs
  }

  private cacheSkill(skill: AnthropicSkill): void {
    const cacheFile = this.getCacheFilePath(skill.metadata.name)
    writeFileSync(cacheFile, JSON.stringify(skill, null, 2))
  }

  private loadCachedSkills(): void {
    if (!existsSync(this.cacheDir)) return

    const files = readdirSync(this.cacheDir).filter((f) => f.endsWith('.json'))

    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(join(this.cacheDir, file), 'utf-8'))
        data.cachedAt = data.cachedAt ? new Date(data.cachedAt) : undefined
        const skill = data as AnthropicSkill
        this.skills.set(skill.metadata.name, skill)
        this.registerWithClaudeAgent(skill)
      } catch {
        // Skip invalid cache files
      }
    }
  }

  // ====================== CLAUDE AGENT INTEGRATION ======================

  private registerWithClaudeAgent(skill: AnthropicSkill): void {
    const skillDefinition: SkillDefinition = {
      name: skill.metadata.name,
      description: skill.metadata.description,
      tools: this.inferToolsFromSkill(skill),
      prompt: skill.instructions,
      category: this.inferCategoryFromSkill(skill),
      riskLevel: this.inferRiskLevelFromSkill(skill),
    }

    claudeAgentProvider.registerSkill(skillDefinition)
  }

  private inferToolsFromSkill(skill: AnthropicSkill): string[] {
    const tools: string[] = ['Read', 'Write', 'Edit', 'Bash']

    // Infer tools based on skill name and content
    const content = skill.instructions.toLowerCase()

    if (content.includes('glob') || content.includes('find file')) {
      tools.push('Glob')
    }
    if (content.includes('grep') || content.includes('search')) {
      tools.push('Grep')
    }
    if (content.includes('web') || content.includes('fetch') || content.includes('http')) {
      tools.push('WebFetch')
    }
    if (content.includes('docx') || content.includes('word')) {
      // Document tools
    }
    if (content.includes('pdf')) {
      // PDF tools
    }
    if (content.includes('xlsx') || content.includes('excel') || content.includes('spreadsheet')) {
      // Spreadsheet tools
    }

    return Array.from(new Set(tools))
  }

  private inferCategoryFromSkill(skill: AnthropicSkill): SkillDefinition['category'] {
    const name = skill.metadata.name.toLowerCase()
    const tags = skill.metadata.tags?.map((t) => t.toLowerCase()) || []
    const content = skill.instructions.toLowerCase()

    if (['docx', 'pdf', 'pptx', 'xlsx'].some((t) => name.includes(t))) {
      return 'file'
    }
    if (tags.includes('code') || content.includes('refactor')) {
      return 'code'
    }
    if (tags.includes('test') || content.includes('test')) {
      return 'test'
    }
    if (tags.includes('deploy') || content.includes('deploy')) {
      return 'deploy'
    }
    if (tags.includes('refactor')) {
      return 'refactor'
    }

    return 'custom'
  }

  private inferRiskLevelFromSkill(skill: AnthropicSkill): SkillDefinition['riskLevel'] {
    const content = skill.instructions.toLowerCase()

    if (
      content.includes('delete') ||
      content.includes('remove') ||
      content.includes('overwrite') ||
      content.includes('deploy')
    ) {
      return 'high'
    }
    if (content.includes('write') || content.includes('edit') || content.includes('modify')) {
      return 'medium'
    }

    return 'low'
  }

  // ====================== PUBLIC API ======================

  /**
   * Get a loaded skill by name
   */
  getSkill(name: string): AnthropicSkill | undefined {
    return this.skills.get(name)
  }

  /**
   * List all loaded skills
   */
  listSkills(): AnthropicSkill[] {
    return Array.from(this.skills.values())
  }

  /**
   * List available skills from the repository (known skills)
   */
  listAvailableSkills(): string[] {
    return [...KNOWN_SKILLS]
  }

  /**
   * Fetch list of skills from GitHub API
   */
  async fetchRemoteSkillsList(): Promise<string[]> {
    const url = `${GITHUB_API_BASE}/repos/${this.config.repoOwner}/${this.config.repoName}/contents/skills?ref=${this.config.branch}`

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'NikCLI',
        },
      })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = (await response.json()) as Array<{ name: string; type: string }>
      return data.filter((item) => item.type === 'dir').map((item) => item.name)
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not fetch remote skills list: ${error}`))
      return [...KNOWN_SKILLS]
    }
  }

  /**
   * Sync all skills from repository
   */
  async syncSkills(): Promise<void> {
    console.log(chalk.blue('🔄 Syncing skills from Anthropic repository...'))

    const remoteSkills = await this.fetchRemoteSkillsList()

    for (const skillName of remoteSkills) {
      try {
        await this.loadSkillFromRepo(skillName)
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Failed to sync skill '${skillName}': ${error}`))
      }
    }

    console.log(chalk.green(`✓ Synced ${this.skills.size} skills`))
    this.emit('sync_complete', { count: this.skills.size })
  }

  /**
   * Remove a skill
   */
  removeSkill(name: string): boolean {
    const removed = this.skills.delete(name)
    if (removed) {
      claudeAgentProvider.removeSkill(name)

      // Remove from cache
      const cacheFile = this.getCacheFilePath(name)
      if (existsSync(cacheFile)) {
        require('node:fs').unlinkSync(cacheFile)
      }

      this.emit('skill_removed', { name })
    }
    return removed
  }

  /**
   * Clear all cached skills
   */
  clearCache(): void {
    if (existsSync(this.cacheDir)) {
      const files = readdirSync(this.cacheDir).filter((f) => f.endsWith('.json'))
      for (const file of files) {
        require('node:fs').unlinkSync(join(this.cacheDir, file))
      }
    }
    this.skills.clear()
    this.emit('cache_cleared')
  }

  // ====================== CONFIG ======================

  getConfig(): SkillProviderConfig {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<SkillProviderConfig>): void {
    this.config = { ...this.config, ...newConfig }

    if (newConfig.cacheDir) {
      this.cacheDir = resolve(process.cwd(), newConfig.cacheDir)
      if (!existsSync(this.cacheDir)) {
        mkdirSync(this.cacheDir, { recursive: true })
      }
    }

    this.emit('config_updated', this.config)
  }

  /**
   * Check if provider is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * Cleanup method to prevent memory leaks
   * Removes all event handlers and clears caches
   */
  cleanup(): void {
    // Unsubscribe from all event handlers
    for (const [event, handlers] of this.eventHandlers.entries()) {
      for (const handler of handlers) {
        this.off(event as any, handler as any)
      }
    }
    this.eventHandlers.clear()

    // Clear skills map to free memory
    this.skills.clear()

    advancedUI.logInfo('SkillProvider cleanup completed')
  }
}

// ====================== SINGLETON EXPORT ======================

export const skillProvider = new SkillProvider()
