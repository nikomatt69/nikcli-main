/**
 * Native Skills Provider for NikCLI
 *
 * Integrates skills in the OpenCode style:
 * - Discovers skills from .nikcli/skills/<name>/SKILL.md
 * - Discovers skills from .claude/skills/<name>/SKILL.md
 * - Loads skills on-demand with caching
 * - Provides CoreTool format for AI SDK integration
 */

import { EventEmitter } from 'node:events'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import chalk from 'chalk'
import * as yaml from 'js-yaml'
import { advancedUI } from '../../ui/advanced-cli-ui'

export interface SkillMetadata {
  name: string
  description: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
}

export interface SkillContent {
  metadata: SkillMetadata
  instructions: string
  rawContent: string
  filePath: string
  source: 'local' | 'global' | 'claude'
}

export interface SkillsPermission {
  pattern: string
  action: 'allow' | 'deny' | 'ask'
}

export interface SkillsNativeConfig {
  enabled: boolean
  projectDir: string
  globalDir: string
  claudeDir: string
  permissions: SkillsPermission[]
  autoLoad: boolean
}

const DEFAULT_PERMISSIONS: SkillsPermission[] = [{ pattern: '*', action: 'allow' }]

const NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

export class SkillsNativeProvider extends EventEmitter {
  private config: SkillsNativeConfig
  private skills: Map<string, SkillContent> = new Map()
  private metadata: Map<string, SkillMetadata> = new Map()
  private loaded: Set<string> = new Set()

  constructor(projectDir: string = process.cwd()) {
    super()

    this.config = {
      enabled: true,
      projectDir,
      globalDir: join(homedir(), '.nikcli', 'skills'),
      claudeDir: join(projectDir, '.claude', 'skills'),
      permissions: DEFAULT_PERMISSIONS,
      autoLoad: false,
    }

    this.initialize()
  }

  private initialize(): void {
    advancedUI.logFunctionCall('skillsnativeproviderinit')

    const discovered = this.discoverSkills()
    advancedUI.logFunctionUpdate(
      'success',
      `Skills Native Provider initialized (${discovered.length} skills discovered)`,
      '🎯'
    )

    this.emit('initialized', { skillCount: discovered.length })
  }

  discoverSkills(): SkillMetadata[] {
    const discovered: SkillMetadata[] = []

    const searchDirs = [
      {
        dir: resolve(this.config.projectDir, '.nikcli', 'skills'),
        source: 'local' as const,
      },
      { dir: resolve(this.config.globalDir), source: 'global' as const },
      { dir: resolve(this.config.claudeDir), source: 'claude' as const },
    ]

    for (const { dir, source } of searchDirs) {
      if (!existsSync(dir)) continue

      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const skillFile = join(dir, entry.name, 'SKILL.md')
        if (!existsSync(skillFile)) continue

        try {
          const content = readFileSync(skillFile, 'utf8')
          const { metadata } = this.parseSkillMd(content)

          if (!NAME_REGEX.test(metadata.name)) {
            console.log(chalk.yellow(`⚠️  Invalid skill name: ${metadata.name} (must match ${NAME_REGEX})`))
            continue
          }

          if (metadata.name !== entry.name) {
            console.log(chalk.yellow(`⚠️  Skill name mismatch: directory=${entry.name}, frontmatter=${metadata.name}`))
            continue
          }

          this.metadata.set(metadata.name, metadata)
          discovered.push(metadata)
        } catch (error: any) {
          console.log(chalk.yellow(`⚠️  Failed to parse skill ${entry.name}: ${error.message}`))
        }
      }
    }

    return discovered
  }

  private parseSkillMd(content: string): SkillContent {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

    if (!frontmatterMatch) {
      throw new Error('Invalid SKILL.md format: missing YAML frontmatter')
    }

    const [, yamlContent, instructions] = frontmatterMatch
    const metadata = yaml.load(yamlContent) as SkillMetadata

    if (!metadata.name || !metadata.description) {
      throw new Error('Invalid SKILL.md: name and description are required in frontmatter')
    }

    if (metadata.description.length > 1024) {
      throw new Error('Invalid SKILL.md: description must be 1-1024 characters')
    }

    if (!NAME_REGEX.test(metadata.name)) {
      throw new Error(`Invalid skill name: ${metadata.name} (must match ${NAME_REGEX})`)
    }

    return {
      metadata,
      instructions: instructions.trim(),
      rawContent: content,
      filePath: '',
      source: 'local',
    }
  }

  async loadSkill(name: string): Promise<SkillContent> {
    if (this.loaded.has(name)) {
      return this.skills.get(name)!
    }

    const metadata = this.metadata.get(name)
    if (!metadata) {
      const availableKeys = Array.from(this.metadata.keys())
      throw new Error(`Skill '${name}' not found. Available: ${availableKeys.join(', ')}`)
    }

    const permission = this.checkPermission(name)
    if (permission === 'deny') {
      throw new Error(`Skill '${name}' is denied by permissions`)
    }

    const searchDirs = [
      resolve(this.config.projectDir, '.nikcli', 'skills'),
      resolve(this.config.globalDir),
      resolve(this.config.claudeDir),
    ]

    for (const dir of searchDirs) {
      const skillFile = join(dir, name, 'SKILL.md')
      if (existsSync(skillFile)) {
        const content = readFileSync(skillFile, 'utf8')
        const parsed = this.parseSkillMd(content)
        parsed.filePath = skillFile

        this.skills.set(name, parsed)
        this.loaded.add(name)

        console.log(chalk.green(`✓ Skill loaded: ${name}`))
        this.emit('skill_loaded', { name })

        return parsed
      }
    }

    throw new Error(`Skill '${name}' file not found`)
  }

  checkPermission(skillName: string): 'allow' | 'deny' | 'ask' {
    for (const { pattern, action } of this.config.permissions) {
      if (pattern === '*') return action

      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      if (regex.test(skillName)) {
        return action
      }
    }

    return 'allow'
  }

  getAvailableSkills(): SkillMetadata[] {
    return Array.from(this.metadata.values()).filter((m) => this.checkPermission(m.name) !== 'deny')
  }

  getSkillMetadata(name: string): SkillMetadata | undefined {
    return this.metadata.get(name)
  }

  isLoaded(name: string): boolean {
    return this.loaded.has(name)
  }

  getConfig(): SkillsNativeConfig {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<SkillsNativeConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.emit('config_updated', this.config)
  }

  setPermissions(permissions: SkillsPermission[]): void {
    this.config.permissions = permissions
    this.emit('permissions_updated', permissions)
  }
}

let _singleton: SkillsNativeProvider | null = null

export function getSkillsNativeProvider(projectDir?: string): SkillsNativeProvider {
  if (!_singleton) {
    _singleton = new SkillsNativeProvider(projectDir || process.cwd())
  }
  return _singleton
}

export const skillsNativeProvider = getSkillsNativeProvider()
