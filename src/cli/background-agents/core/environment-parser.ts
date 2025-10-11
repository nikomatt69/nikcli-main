// src/cli/background-agents/core/environment-parser.ts

import * as fs from 'node:fs/promises'
import * as path from 'path'
import { z } from 'zod'
import type { NikEnvironment } from '../types'

// Zod schemas for validation
const TerminalConfigSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  autoStart: z.boolean().optional().default(false),
  persistent: z.boolean().optional().default(true),
})

const EnvironmentPoliciesSchema = z.object({
  maxMemoryMB: z.number().positive().optional().default(4096),
  maxCpuPercent: z.number().min(1).max(100).optional().default(80),
  networkPolicy: z.enum(['restricted', 'allow', 'deny']).optional().default('restricted'),
  allowedDomains: z.array(z.string()).optional().default([]),
  timeoutMinutes: z.number().positive().optional().default(30),
})

const NikEnvironmentSchema = z.object({
  snapshot: z.enum(['auto', 'manual', 'disabled']).default('auto'),
  install: z.string().min(1),
  start: z.string().optional().default(''),
  terminals: z.array(TerminalConfigSchema).default([]),
  secrets: z.array(z.string()).default([]),
  node: z.string().optional(),
  cache: z.array(z.string()).default(['node_modules']),
  policies: EnvironmentPoliciesSchema.optional(),
})

export interface EnvironmentParseResult {
  success: boolean
  environment?: NikEnvironment
  errors?: string[]
  warnings?: string[]
}

export class EnvironmentParser {
  /**
   * Parse and validate .nik/environment.json file
   */
  static async parseFromDirectory(workingDirectory: string): Promise<EnvironmentParseResult> {
    const environmentPath = path.join(workingDirectory, '.nik', 'environment.json')

    try {
      // Check if file exists
      const stats = await fs.stat(environmentPath)
      if (!stats.isFile()) {
        return {
          success: false,
          errors: ['.nik/environment.json is not a file'],
        }
      }

      // Read and parse JSON
      const content = await fs.readFile(environmentPath, 'utf8')
      const rawData = JSON.parse(content)

      // Validate with Zod
      const result = NikEnvironmentSchema.safeParse(rawData)

      if (!result.success) {
        return {
          success: false,
          errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        }
      }

      // Additional validation and warnings
      const warnings = EnvironmentParser.validateConfiguration(result.data)

      return {
        success: true,
        environment: result.data,
        warnings,
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          success: false,
          errors: ['.nik/environment.json not found'],
        }
      }

      if (error instanceof SyntaxError) {
        return {
          success: false,
          errors: [`Invalid JSON syntax: ${error.message}`],
        }
      }

      return {
        success: false,
        errors: [`Failed to parse environment: ${error.message}`],
      }
    }
  }

  /**
   * Create default environment.json file
   */
  static async createDefault(
    workingDirectory: string,
    packageManager: 'yarn' | 'npm' | 'pnpm' = 'yarn'
  ): Promise<void> {
    const nikDir = path.join(workingDirectory, '.nik')
    const environmentPath = path.join(nikDir, 'environment.json')

    // Ensure .nik directory exists
    await fs.mkdir(nikDir, { recursive: true })

    // Detect project type and create appropriate config
    const projectType = await EnvironmentParser.detectProjectType(workingDirectory)
    const defaultConfig = EnvironmentParser.generateDefaultConfig(packageManager, projectType)

    await fs.writeFile(environmentPath, JSON.stringify(defaultConfig, null, 2), 'utf8')
  }

  /**
   * Validate configuration and return warnings
   */
  private static validateConfiguration(config: NikEnvironment): string[] {
    const warnings: string[] = []

    // Check for potentially dangerous commands with word boundaries
    const dangerousPatterns = [
      { pattern: /\brm\s+-rf\s+\//g, name: 'rm -rf /' },
      { pattern: /\bsudo\s+rm\b/g, name: 'sudo rm' },
      { pattern: /\bchmod\s+777\b/g, name: 'chmod 777' },
      { pattern: /\bmkfs\b/g, name: 'mkfs' },
      { pattern: /\bdd\s+if=/g, name: 'dd if=' },
    ]

    // Check for command chaining that could be dangerous
    const chainingPatterns = [/&&\s*rm/g, /;\s*rm/g, /\|\|\s*rm/g]

    const allCommands = [config.install, config.start, ...config.terminals.map((t) => t.command)]

    allCommands.forEach((cmd, index) => {
      if (!cmd) return

      // Check dangerous patterns
      dangerousPatterns.forEach(({ pattern, name }) => {
        if (pattern.test(cmd)) {
          warnings.push(`Potentially dangerous command detected: "${name}" in command ${index}`)
        }
      })

      // Check command chaining
      chainingPatterns.forEach((pattern) => {
        if (pattern.test(cmd)) {
          warnings.push(`Potentially dangerous command chaining detected in command ${index}`)
        }
      })
    })

    // Check resource limits
    if (config.policies?.maxMemoryMB && config.policies.maxMemoryMB > 8192) {
      warnings.push('Memory limit exceeds 8GB, this may cause system issues')
    }

    // Check secrets
    if (config.secrets.length === 0 && config.terminals.some((t) => t.command.includes('api'))) {
      warnings.push('No secrets configured but API-related commands detected')
    }

    // Check cache directories
    const suspiciousCacheDirs = ['.git', '.env', 'secrets']
    config.cache.forEach((dir) => {
      if (suspiciousCacheDirs.some((sus) => dir.includes(sus))) {
        warnings.push(`Potentially sensitive directory in cache: ${dir}`)
      }
    })

    return warnings
  }

  /**
   * Detect project type based on files present
   */
  private static async detectProjectType(workingDirectory: string): Promise<string> {
    const checkFiles = [
      { file: 'package.json', type: 'node' },
      { file: 'next.config.js', type: 'nextjs' },
      { file: 'nuxt.config.js', type: 'nuxt' },
      { file: 'vite.config.ts', type: 'vite' },
      { file: 'tsconfig.json', type: 'typescript' },
      { file: 'Cargo.toml', type: 'rust' },
      { file: 'go.mod', type: 'go' },
      { file: 'requirements.txt', type: 'python' },
    ]

    for (const { file, type } of checkFiles) {
      try {
        await fs.access(path.join(workingDirectory, file))
        return type
      } catch {
        // File doesn't exist, continue
      }
    }

    return 'generic'
  }

  /**
   * Generate default configuration based on project type
   */
  private static generateDefaultConfig(packageManager: string, projectType: string): NikEnvironment {
    const baseConfig: NikEnvironment = {
      snapshot: 'auto',
      install: `${packageManager} install`,
      start: '',
      terminals: [],
      secrets: ['OPENAI_API_KEY,OPENROUTER_API_KEY'],
      cache: ['node_modules'],
      policies: {
        maxMemoryMB: 4096,
        maxCpuPercent: 80,
        networkPolicy: 'restricted',
        allowedDomains: ['registry.npmjs.org', 'github.com'],
        timeoutMinutes: 30,
      },
    }

    // Customize based on project type
    switch (projectType) {
      case 'nextjs':
        baseConfig.install = `${packageManager} install`
        baseConfig.terminals = [
          { name: 'Dev Server', command: `${packageManager} dev`, autoStart: true },
          { name: 'Build', command: `${packageManager} build`, autoStart: false },
        ]
        baseConfig.cache.push('.next', '.turbo')
        baseConfig.secrets.push('NEXTAUTH_SECRET', 'DATABASE_URL', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY')
        break

      case 'vite':
        baseConfig.terminals = [
          { name: 'Dev Server', command: `${packageManager} dev`, autoStart: true },
          { name: 'Build', command: `${packageManager} build`, autoStart: false },
          { name: 'Preview', command: `${packageManager} preview`, autoStart: false },
        ]
        baseConfig.cache.push('dist', '.vite')
        break

      case 'node':
        baseConfig.terminals = [
          { name: 'Start', command: `${packageManager} start`, autoStart: false },
          { name: 'Test', command: `${packageManager} test`, autoStart: false },
        ]
        break

      default:
        // Keep base config
        break
    }

    return baseConfig
  }

  /**
   * Merge environment with runtime overrides
   */
  static mergeWithOverrides(environment: NikEnvironment, overrides: Partial<NikEnvironment>): NikEnvironment {
    return {
      ...environment,
      ...overrides,
      terminals: overrides.terminals || environment.terminals,
      secrets: [...new Set([...environment.secrets, ...(overrides.secrets || [])])],
      cache: [...new Set([...environment.cache, ...(overrides.cache || [])])],
      policies: {
        ...environment.policies,
        ...overrides.policies,
      },
    }
  }
}
