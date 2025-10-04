#!/usr/bin/env node

/**
 * NikCLI - Unified Autonomous AI Development Assistant
 * Consolidated Entry Point with Modular Architecture
 */

// Set quiet startup mode immediately to prevent module initialization logs
process.env.NIKCLI_QUIET_STARTUP = 'true'

// Load environment variables first
import dotenv from 'dotenv'

dotenv.config()

import chalk from 'chalk'
import gradient from 'gradient-string'

// Global unhandled promise rejection handlers for system stability
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error(chalk.red('⚠️  Unhandled Promise Rejection:'))
  console.error(chalk.red('Reason:', reason))
  console.error(chalk.red('Promise:', promise))

  // Log stack trace if available
  if (reason && reason.stack) {
    console.error(chalk.gray('Stack:', reason.stack))
  }

  // Graceful handling - don't exit process, but log for debugging
  console.error(chalk.yellow('System continuing with error logged...'))
})

process.on('uncaughtException', (error: Error) => {
  console.error(chalk.red('⚠️  Uncaught Exception:'))
  console.error(chalk.red('Error:', error.message))
  console.error(chalk.gray('Stack:', error.stack))

  // For uncaught exceptions, we need to exit gracefully
  console.error(chalk.red('System shutting down due to uncaught exception...'))
  process.exit(1)
})

// Promise rejection warning handler
process.on('warning', (warning: any) => {
  if (warning.name === 'DeprecationWarning' && warning.code === 'DEP0018') {
    // Ignore deprecation warnings for unhandled promise rejections
    return
  }
  console.warn(chalk.yellow(`⚠️  Warning: ${warning.message}`))
  if (warning.stack) {
    console.warn(chalk.gray(warning.stack))
  }
})

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as path from 'node:path'
// Import TUI Bridge instead of boxen for enhanced terminal UI
import boxen from 'boxen'
import * as readline from 'readline'
import { AgentManager } from './core/agent-manager'
import { simpleConfigManager as configManager } from './core/config-manager'
import { ideDetector } from './core/ide-detector'
import { Logger } from './core/logger'
// Core imports
import { NikCLI } from './nik-cli'
import { ideAwareFormatter } from './ui/ide-aware-formatter'
import { ExecutionPolicyManager } from './policies/execution-policy'
// Core cloud services - imported to initialize singletons (enabled by default)
import { enhancedSupabaseProvider } from './providers/supabase/enhanced-supabase-provider'
import { redisProvider } from './providers/redis/redis-provider'
import { cacheService } from './services/cache-service'
import { registerAgents } from './register-agents'
import { agentService } from './services/agent-service'
import { lspService } from './services/lsp-service'
import { memoryService } from './services/memory-service'
import { planningService } from './services/planning-service'
import { snapshotService } from './services/snapshot-service'
import { toolService } from './services/tool-service'
import { diffManager } from './ui/diff-manager'
import { Logger as UtilsLogger } from './utils/logger'

// Global declarations for vision/image providers
declare global {
  var visionProvider: any
  var imageGenerator: any
}

// Types from streaming orchestrator
interface StreamMessage {
  id: string
  type: 'user' | 'system' | 'agent' | 'tool' | 'diff' | 'error'
  content: string
  timestamp: Date
  status: 'queued' | 'processing' | 'completed' | 'absorbed'
  metadata?: any
  agentId?: string
  progress?: number
}

interface StreamContext {
  workingDirectory: string
  autonomous: boolean
  planMode: boolean
  autoAcceptEdits: boolean
  contextLeft: number
  maxContext: number
}

// ASCII Art Banner
const banner = `
███╗   ██╗██╗██╗  ██╗ ██████╗██╗     ██╗
████╗  ██║██║██║ ██╔╝██╔════╝██║     ██║
██╔██╗ ██║██║█████╔╝ ██║     ██║     ██║
██║╚██╗██║██║██╔═██╗ ██║     ██║     ██║
██║ ╚████║██║██║  ██╗╚██████╗███████╗██║
╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝
`

class BannerAnimator {
  private static frames: string[] = []
  private static readonly palettes: [string, string][] = [
    // Blue → White progression
    ['#0ea5e9', '#ffffff'],
    ['#38bdf8', '#e0f2fe'],
    ['#60a5fa', '#bfdbfe'],
    ['#3b82f6', '#93c5fd'],
    ['#2563eb', '#60a5fa'],
    // Transition into deeper blues
    ['#1d4ed8', '#1e3a8a'],
    ['#1e40af', '#60a5fa'],
    // Blue → Black progression
    ['#60a5fa', '#1e3a8a'],
    // Symmetric return for smooth loop
    ['#1e40af', '#60a5fa'],
    ['#1d4ed8', '#1e3a8a'],
    ['#2563eb', '#60a5fa'],
  ]

  private static ensureFrames(): void {
    if (BannerAnimator.frames.length > 0) {
      return
    }

    BannerAnimator.frames = BannerAnimator.palettes.map((colors) => gradient(colors).multiline(banner))
  }

  static renderStatic(): string {
    BannerAnimator.ensureFrames()
    return BannerAnimator.frames[0] || chalk.cyanBright(banner)
  }

  static printStatic(): void {
    console.log(BannerAnimator.renderStatic())
  }

  static async play(options: { cycles?: number; frameInterval?: number } = {}): Promise<void> {
    const cycles = options.cycles ?? 3
    const frameInterval = options.frameInterval ?? 90

    BannerAnimator.ensureFrames()
    const frames = BannerAnimator.frames

    if (!process.stdout.isTTY || process.env.CI || process.env.NIKCLI_NO_ANIMATION === '1' || frames.length === 0) {
      console.clear()
      BannerAnimator.printStatic()
      return
    }

    const totalFrames = frames.length * Math.max(1, cycles)

    await new Promise<void>((resolve) => {
      let index = 0
      let timer: NodeJS.Timeout

      const renderFrame = () => {
        console.clear()
        console.log(frames[index % frames.length])
        index += 1

        if (index >= totalFrames) {
          if (timer) clearInterval(timer)
          console.clear()
          console.log(frames[frames.length - 1])
          resolve()
        }
      }

      renderFrame()
      timer = setInterval(renderFrame, frameInterval)
    })
  }
}

/**
 * Version utilities for checking current and latest versions
 */
interface VersionInfo {
  current: string
  latest?: string
  hasUpdate?: boolean
  error?: string
}

function getCurrentVersion(): string {
  try {
    const packagePath = path.join(__dirname, '../../package.json')
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    return packageJson.version
  } catch (_error) {
    return 'unknown'
  }
}

async function getLatestVersion(packageName: string = '@nicomatt69/nikcli'): Promise<string | null> {
  try {
    // Get package info with all versions and tags
    const response = await fetch(`https://registry.npmjs.org/${packageName}`)
    if (!response.ok) {
      return null
    }
    const data = await response.json()

    // Get the latest and beta versions
    const latestVersion = data['dist-tags']?.latest
    const betaVersion = data['dist-tags']?.beta

    // Compare and return the highest version
    if (!latestVersion && !betaVersion) return null
    if (!latestVersion) return betaVersion
    if (!betaVersion) return latestVersion

    // Compare versions and return the highest
    const isBetaNewer = compareVersions(latestVersion, betaVersion)
    return isBetaNewer ? betaVersion : latestVersion
  } catch (_error) {
    return null
  }
}

function compareVersions(current: string, latest: string): boolean {
  const currentParts = current.replace('-beta', '').split('.').map(Number)
  const latestParts = latest.replace('-beta', '').split('.').map(Number)

  for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
    const currentPart = currentParts[i] || 0
    const latestPart = latestParts[i] || 0

    if (latestPart > currentPart) return true
    if (latestPart < currentPart) return false
  }

  return false
}

async function getVersionInfo(): Promise<VersionInfo> {
  const current = getCurrentVersion()

  try {
    const latest = await getLatestVersion()
    if (!latest) {
      return { current, error: 'Unable to check for updates' }
    }

    const hasUpdate = compareVersions(current, latest)
    return { current, latest, hasUpdate }
  } catch (_error) {
    return { current, error: 'Network error checking for updates' }
  }
}

/**
 * Introduction Display Module
 */
class IntroductionModule {
  static displayBanner() {
    console.clear()
    BannerAnimator.printStatic()
  }

  static displayApiKeySetup() {
    // Enhanced TUI version with better theming and structure
    const setupBox = boxen(
      chalk.yellow.bold('  API Key Required\n\n') +
      chalk.white('To use NikCLI, please set at least one API key:\n\n') +
      chalk.green('• ANTHROPIC_API_KEY') +
      chalk.gray(' - for Claude models (recommended)\n') +
      chalk.blue('• OPENAI_API_KEY') +
      chalk.gray(' - for GPT models\n') +
      chalk.magenta('• GOOGLE_GENERATIVE_AI_API_KEY') +
      chalk.gray(' - for Gemini models\n') +
      chalk.cyan('• AI_GATEWAY_API_KEY') +
      chalk.gray(' - for Vercel AI Gateway (smart routing)\n\n') +
      chalk.white.bold('Setup Examples:\n') +
      chalk.dim('export ANTHROPIC_API_KEY="your-key-here"\n') +
      chalk.dim('export OPENAI_API_KEY="your-key-here"\n') +
      chalk.dim('export GOOGLE_GENERATIVE_AI_API_KEY="your-key-here"\n') +
      chalk.dim('export AI_GATEWAY_API_KEY="your-key-here"\n\n') +
      chalk.cyan('Then run: ') +
      chalk.white.bold('npm start'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        backgroundColor: '#2a1a00',
        title: 'API Configuration',
      }
    )

    console.log(setupBox)
  }

  static displayStartupInfo() {
    // Display IDE-aware environment context
    console.log('\n' + ideAwareFormatter.formatEnvironmentContext() + '\n')

    // Show IDE-specific suggestions
    const suggestions = ideAwareFormatter.getSuggestions()
    if (suggestions.length > 0) {
      console.log(chalk.bold('💡 IDE-Specific Tips:'))
      suggestions.forEach(suggestion => console.log('  ' + suggestion))
      console.log()
    }

    // Enhanced TUI version with status indicators
    const startupBox = boxen(
      chalk.green.bold('🚀 Starting NikCLI...\n\n') +
      chalk.white('Initializing autonomous AI assistant\n') +
      chalk.gray('• Loading project context\n') +
      chalk.gray('• Preparing planning system\n') +
      chalk.gray('• Setting up tool integrations\n\n') +
      chalk.cyan('Type ') +
      chalk.white.bold('/help') +
      chalk.cyan(' for available commands'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
        backgroundColor: '#001a00',
        title: 'System Status',
      }
    )

    console.log(startupBox)
  }
}

/**
 * Onboarding Module
 */
class OnboardingModule {
  private static apiKeyStatus: 'unknown' | 'present' | 'skipped' | 'ollama' = 'unknown'

  private static renderSection(lines: string[]): void {
    console.clear()
    BannerAnimator.printStatic()
    console.log()
    for (const line of lines) {
      console.log(line)
    }
    console.log()
  }

  private static async pause(ms: number = 600): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }

  static async runOnboarding(): Promise<boolean> {
    await BannerAnimator.play()

    // Step 1: Version Information
    await OnboardingModule.showVersionInfo()

    // Step 2: Beta Warning
    await OnboardingModule.showBetaWarning()

    // Step 3: API Key Setup
    const _hasKeys = await OnboardingModule.setupApiKeys()

    // Step 4: Enhanced Services Setup (optional)
    await OnboardingModule.setupEnhancedServices()

    // Step 5: System Check
    const systemOk = await OnboardingModule.checkSystemRequirements()

    // Onboarding is complete if system requirements are met
    // API keys and enhanced services are optional
    return systemOk
  }

  private static async showBetaWarning(): Promise<void> {
    const warningBox = boxen(
      chalk.red.bold('🚨  BETA VERSION WARNING\n\n') +
      chalk.white('NikCLI is currently in beta and may contain bugs or unexpected behavior.\n\n') +
      chalk.yellow.bold('Potential Risks:\n') +
      chalk.white('• File system modifications\n') +
      chalk.white('• Code generation may not always be optimal\n') +
      chalk.white('• AI responses may be inaccurate\n') +
      chalk.white('• System resource usage\n\n') +
      chalk.cyan('For detailed security information, visit:\n') +
      chalk.blue.underline('https://github.com/nikomatt69/nikcli-main/blob/main/SECURITY.md\n\n') +
      chalk.white('By continuing, you acknowledge these risks.'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'red',
        backgroundColor: '#2a0000',
        title: 'Security Notice',
      }
    )

    OnboardingModule.renderSection([warningBox])

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    const answer: string = await new Promise((resolve) =>
      rl.question(chalk.yellow('\nDo you want to continue? (y/N): '), resolve)
    )
    rl.close()

    if (!answer || !answer.toLowerCase().startsWith('y')) {
      console.log(chalk.blue('\n👋 Thanks for trying NikCLI!'))
      process.exit(0)
    }
  }

  private static async setupApiKeys(): Promise<boolean> {
    const header = chalk.blueBright('🔑 API Key Setup')

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    const openaiKey = process.env.OPENAI_API_KEY
    const openrouterKey = process.env.OPENROUTER_API_KEY
    const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    const vercelKey = process.env.V0_API_KEY
    const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY

    if (anthropicKey || openaiKey || openrouterKey || googleKey || vercelKey || gatewayKey) {
      OnboardingModule.apiKeyStatus = 'present'
      return true
    }

    // Check for Ollama models before prompting the user
    try {
      const currentModel = configManager.get('currentModel')
      const modelCfg = (configManager.get('models') as any)[currentModel]
      if (modelCfg && modelCfg.provider === 'ollama') {
        OnboardingModule.apiKeyStatus = 'ollama'
        return true
      }
    } catch (_) {
      // ignore config errors
    }

    const setupBox = boxen(
      chalk.yellow.bold('⚠️  No API keys detected\n\n') +
      chalk.white('To unlock the best experience, add at least one API key:\n\n') +
      chalk.green('• ANTHROPIC_API_KEY') +
      chalk.gray(' – Claude models (recommended)\n') +
      chalk.blue('• OPENAI_API_KEY') +
      chalk.gray(' – GPT models\n') +
      chalk.yellow('• OPENROUTER_API_KEY') +
      chalk.gray(' – Multi-provider routing\n') +
      chalk.magenta('• GOOGLE_GENERATIVE_AI_API_KEY') +
      chalk.gray(' – Gemini models\n') +
      chalk.cyan('• AI_GATEWAY_API_KEY / V0_API_KEY') +
      chalk.gray(' – Vercel integrations\n\n') +
      chalk.white.bold('Example commands:\n') +
      chalk.dim('export ANTHROPIC_API_KEY="your-key"\n') +
      chalk.dim('export OPENROUTER_API_KEY="your-key"\n\n') +
      chalk.cyan('Prefer local models? Configure Ollama below.'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        backgroundColor: '#2a1a00',
        title: 'API Configuration',
      }
    )

    OnboardingModule.renderSection([header, setupBox])

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    const answer: string = await new Promise((resolve) =>
      rl.question(chalk.yellow('Continue without API keys? (y/N): '), resolve)
    )
    rl.close()

    if (!answer || !answer.toLowerCase().startsWith('y')) {
      const exitBox = boxen(chalk.blue.bold('👋 Set up your API keys and restart NikCLI when ready!'), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'blue',
        backgroundColor: '#001a33',
        title: 'Setup Required',
      })
      OnboardingModule.renderSection([header, exitBox])
      process.exit(0)
    }

    const configured = await OnboardingModule.setupOllama()
    OnboardingModule.apiKeyStatus = configured ? 'ollama' : 'skipped'
    return configured
  }

  private static async checkSystemRequirements(): Promise<boolean> {
    let runtimeOk = true

    try {

      {
        const version = process.version
        const major = parseInt(version.slice(1).split('.')[0])
        if (major < 18) {
          runtimeOk = false
        }
      }
    } catch (_) {
      const version = process.version
      const major = parseInt(version.slice(1).split('.')[0])
      if (major < 18) {
        runtimeOk = false
      }
    }

    let ollamaOk = true
    try {
      const currentModel = configManager.get('currentModel')
      const modelCfg = (configManager.get('models') as any)[currentModel]
      if (modelCfg && modelCfg.provider === 'ollama') {
        const host = process.env.OLLAMA_HOST || '127.0.0.1:11434'
        const base = host.startsWith('http') ? host : `http://${host}`

        try {
          const res = await fetch(`${base}/api/tags`, { method: 'GET' } as any)
          if (!res.ok) {
            ollamaOk = false
          }
        } catch (_err) {
          ollamaOk = false
        }
      }
    } catch (_) {
      // ignore config errors
    }

    const allPassed = runtimeOk && ollamaOk

    if (allPassed) {
      // Show minimal success box
      const summaryBox = boxen(
        chalk.white('✓ Node.js v') +
        chalk.white(process.version) +
        '\n' +
        chalk.white('✓ Cloud API provider configured'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
          backgroundColor: '#001a00',
          title: 'Environment Ready',
        }
      )
      console.log(summaryBox)
    }

    return allPassed
  }

  private static async setupOllama(): Promise<boolean> {
    const header = chalk.blueBright('🔌 Ollama Setup')
    const providerMissingBox = () =>
      boxen(chalk.yellow('⚠️ No AI provider configured yet. Configure an API key or Ollama to continue later.'), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        backgroundColor: '#2a1a00',
        title: 'Setup Pending',
      })

    try {
      const models = (configManager.get('models') as any) || {}
      const ollamaEntries = Object.entries(models).filter(([, cfg]: any) => cfg.provider === 'ollama')

      if (ollamaEntries.length > 0) {
        const list = ollamaEntries
          .map(([name, cfg]: any, idx: number) => `${idx + 1}. ${chalk.white(name)} ${chalk.dim(`(${cfg.model})`)}`)
          .join('\n')

        const modelsBox = boxen(
          chalk.green.bold('✓ Local Ollama models detected\n\n') +
          list +
          '\n\n' +
          chalk.white('Use a local model to run NikCLI without external API keys.'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            backgroundColor: '#001a00',
            title: 'Local Models',
          }
        )

        OnboardingModule.renderSection([header, modelsBox])

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })
        const answer: string = await new Promise((resolve) =>
          rl.question(chalk.yellow('Use a local Ollama model? (Y/n): '), resolve)
        )
        rl.close()

        if (!answer || answer.toLowerCase().startsWith('y')) {
          let chosenName = ollamaEntries[0][0] as string
          if (ollamaEntries.length > 1) {
            const rl2 = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            })
            const pick = await new Promise<string>((resolve) =>
              rl2.question(chalk.cyan('Select model number (default 1): '), resolve)
            )
            rl2.close()
            const idx = parseInt((pick || '1').trim(), 10)
            if (!Number.isNaN(idx) && idx >= 1 && idx <= ollamaEntries.length) {
              chosenName = ollamaEntries[idx - 1][0] as string
            }
          }

          configManager.setCurrentModel(chosenName)
          const successBox = boxen(chalk.green.bold(`✓ Using local model: ${chosenName}`), {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            backgroundColor: '#001a00',
            title: 'Configuration Updated',
          })
          OnboardingModule.renderSection([header, successBox])
          await OnboardingModule.pause()
          return true
        }

        OnboardingModule.renderSection([header, providerMissingBox()])
        await OnboardingModule.pause()
        return false
      }

      const promptBox = boxen(
        chalk.yellow.bold('No Ollama models configured yet.\n\n') +
        chalk.white('Add the default `llama3.1:8b` model now?\n') +
        chalk.dim('This enables fully local inference without API keys.'),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
          backgroundColor: '#2a1a00',
          title: 'Add Default Model',
        }
      )

      OnboardingModule.renderSection([header, promptBox])

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
      const answer: string = await new Promise((resolve) =>
        rl.question(chalk.yellow('Add default Ollama model (llama3.1:8b)? (Y/n): '), resolve)
      )
      rl.close()

      if (!answer || answer.toLowerCase().startsWith('y')) {
        const defaultName = 'llama3.1:8b'
        configManager.addModel(defaultName, {
          provider: 'ollama',
          model: 'llama3.1:8b',
        } as any)
        configManager.setCurrentModel(defaultName)
        const successBox = boxen(chalk.green.bold('✓ Default Ollama model configured'), {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'green',
          backgroundColor: '#001a00',
          title: 'Configuration Updated',
        })
        OnboardingModule.renderSection([header, successBox])
        await OnboardingModule.pause()
        return true
      }
    } catch (_error) {
      const errorBox = boxen(chalk.yellow('⚠️ Unable to configure Ollama automatically'), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        backgroundColor: '#2a1a00',
        title: 'Ollama Setup',
      })
      OnboardingModule.renderSection([header, errorBox])
    }

    OnboardingModule.renderSection([header, providerMissingBox()])
    await OnboardingModule.pause()
    return false
  }

  private static async setupEnhancedServices(): Promise<void> {
    const header = chalk.blueBright('🚀 Enhanced Services Setup')

    const config = configManager.getAll()
    const redisEnabled = Boolean(config.redis?.enabled)
    const supabaseEnabled = Boolean(config.supabase?.enabled)

    if (!redisEnabled && !supabaseEnabled) {
      const infoBox = boxen(
        chalk.gray(
          'Enhanced services (Redis, Supabase) are currently disabled.\nYou can enable them later from the configuration menu.'
        ),
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'gray',
          backgroundColor: '#111111',
          title: 'Optional Services',
        }
      )
      OnboardingModule.renderSection([header, infoBox])
      await OnboardingModule.pause()
      return
    }

    const sections: string[] = []

    if (redisEnabled) {
      try {
        const redisConfig = config.redis
        const redisLines = [
          chalk.cyan.bold('🔴 Redis Cache Service'),
          chalk.gray(`Host: ${redisConfig!.host}:${redisConfig!.port}`),
          chalk.gray(`Database: ${redisConfig!.database}`),
          chalk.gray(`Fallback: ${redisConfig!.fallback.enabled ? 'Enabled' : 'Disabled'}`),
          chalk.green('✓ Configuration loaded'),
        ]
        sections.push(redisLines.join('\n'))
      } catch (_error: any) {
        sections.push(chalk.yellow('🔴 Redis Cache Service\n⚠️  Configuration issue detected'))
      }
    }

    if (supabaseEnabled) {
      try {
        const supabaseCredentials = configManager.getSupabaseCredentials()
        const hasCredentials = Boolean(supabaseCredentials.url && supabaseCredentials.anonKey)
        const supabaseConfig = config.supabase

        if (hasCredentials) {
          const featureList = Object.entries(supabaseConfig!.features)
            .filter(([_, enabled]) => enabled)
            .map(([feature]) => `• ${feature}`)
            .join('\n')

          const supabaseLines = [
            chalk.green.bold('🟢 Supabase Integration'),
            chalk.green('✓ Credentials detected'),
            featureList ? chalk.gray(featureList) : chalk.gray('No advanced features enabled'),
          ]
          sections.push(supabaseLines.join('\n'))

          if (supabaseConfig!.features.auth) {
            await OnboardingModule.setupAuthentication()
          }
        } else {
          sections.push(
            chalk.yellow(
              '🟢 Supabase Integration\n⚠️  SUPABASE_URL or SUPABASE_ANON_KEY missing.\n   Add them to enable cloud persistence.'
            )
          )
        }
      } catch (_error: any) {
        sections.push(chalk.yellow('🟢 Supabase Integration\n⚠️  Unable to read Supabase configuration'))
      }
    }

    if (sections.length > 0) {
      const servicesBox = boxen(sections.join('\n\n'), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        backgroundColor: '#001a2a',
        title: 'Service Status',
      })
      OnboardingModule.renderSection([header, servicesBox])
      await OnboardingModule.pause()
    }
  }

  private static async setupAuthentication(): Promise<void> {
    const header = chalk.cyanBright('🔐 Authentication Setup')
    const introBox = boxen(
      chalk.white('Sign in to sync progress across devices and unlock collaborative features.\n') +
      chalk.gray('You can always connect later with the /auth command.'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        backgroundColor: '#001a2a',
        title: 'Optional Sign-In',
      }
    )

    OnboardingModule.renderSection([header, introBox])

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    try {
      const authChoice = await new Promise<string>((resolve) =>
        rl.question(chalk.yellow('Would you like to sign in? (y/N): '), resolve)
      )

      if (authChoice && authChoice.toLowerCase().startsWith('y')) {
        const optionsBox = boxen(
          chalk.white('1. Sign in with existing account\n2. Create new account\n3. Continue as guest'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
            backgroundColor: '#001a2a',
            title: 'Choose Method',
          }
        )
        OnboardingModule.renderSection([header, optionsBox])

        const methodChoice = await new Promise<string>((resolve) =>
          rl.question(chalk.yellow('Select option (1-3, default 3): '), resolve)
        )

        switch ((methodChoice.trim() || '3').toLowerCase()) {
          case '1':
            await OnboardingModule.handleSignIn(rl, header)
            break
          case '2':
            await OnboardingModule.handleSignUp(rl, header)
            break
          case '3':
          default:
            OnboardingModule.renderSection([
              header,
              boxen(chalk.gray('👤 Continuing as guest. Connect later with /auth.'), {
                padding: 1,
                borderStyle: 'round',
                borderColor: 'gray',
                backgroundColor: '#111111',
                title: 'Guest Mode',
              }),
            ])
            await OnboardingModule.pause()
            break
        }
      } else {
        OnboardingModule.renderSection([
          header,
          boxen(chalk.gray('👤 Authentication skipped. You can sign in anytime with /auth.'), {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'gray',
            backgroundColor: '#111111',
            title: 'Guest Mode',
          }),
        ])
        await OnboardingModule.pause()
      }
    } catch (error: any) {
      OnboardingModule.renderSection([
        header,
        boxen(chalk.yellow(`⚠️ Authentication setup failed: ${error.message}`), {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
          backgroundColor: '#2a1a00',
          title: 'Authentication',
        }),
      ])
      await OnboardingModule.pause()
    } finally {
      rl.close()
    }
  }

  private static async handleSignIn(rl: readline.Interface, header: string): Promise<void> {
    try {
      const email = await new Promise<string>((resolve) => rl.question('Email: ', resolve))
      const password = await new Promise<string>((resolve) => rl.question('Password: ', resolve))

      if (!email || !password) {
        return
      }

      OnboardingModule.renderSection([
        header,
        boxen(chalk.blue('⚡︎ Signing in...'), {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          backgroundColor: '#001a2a',
          title: 'Authentication',
        }),
      ])

      const { authProvider } = await import('./providers/supabase/auth-provider')

      const result = await authProvider.signIn(email, password, {
        rememberMe: true,
      })

      if (result) {
        const successBox = boxen(
          chalk.green(`✓ Welcome back, ${result.profile.email || result.profile.username}!`) +
          '\n' +
          chalk.gray(`Subscription: ${result.profile.subscription_tier}`),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            backgroundColor: '#001a00',
            title: 'Signed In',
          }
        )
        OnboardingModule.renderSection([header, successBox])
      } else {
        const failureBox = boxen(chalk.red('❌ Sign in failed. Check your credentials and try again.'), {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'red',
          backgroundColor: '#2a0000',
          title: 'Signed In',
        })
        OnboardingModule.renderSection([header, failureBox])
      }
    } catch (_error: any) {
      const errorBox = boxen(chalk.red('❌ Sign in error'), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'red',
        backgroundColor: '#2a0000',
        title: 'Signed In',
      })
      OnboardingModule.renderSection([header, errorBox])
    } finally {
      await OnboardingModule.pause()
    }
  }

  private static async handleSignUp(rl: readline.Interface, header: string): Promise<void> {
    try {
      const email = await new Promise<string>((resolve) => rl.question('Email: ', resolve))
      const password = await new Promise<string>((resolve) => rl.question('Password: ', resolve))
      const username = await new Promise<string>((resolve) => rl.question('Username (optional): ', resolve))

      if (!email || !password) {
        return
      }

      OnboardingModule.renderSection([
        header,
        boxen(chalk.blue('⚡︎ Creating account...'), {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          backgroundColor: '#001a2a',
          title: 'Authentication',
        }),
      ])

      const { authProvider } = await import('./providers/supabase/auth-provider')

      const result = await authProvider.signUp(email, password, {
        username: username || undefined,
      })

      if (result) {
        const successBox = boxen(
          chalk.green('✓ Account created successfully!') +
          '\n' +
          chalk.gray(`Welcome, ${result.profile.email}!`) +
          '\n' +
          chalk.dim('Check your email for verification if required.'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            backgroundColor: '#001a00',
            title: 'Account Created',
          }
        )
        OnboardingModule.renderSection([header, successBox])
      } else {
        const failureBox = boxen(chalk.red('❌ Account creation failed. Please try again later.'), {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'red',
          backgroundColor: '#2a0000',
          title: 'Account Created',
        })
        OnboardingModule.renderSection([header, failureBox])
      }
    } catch (_error: any) {
      const errorBox = boxen(chalk.red('❌ Sign up error'), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'red',
        backgroundColor: '#2a0000',
        title: 'Account Created',
      })
      OnboardingModule.renderSection([header, errorBox])
    } finally {
      await OnboardingModule.pause()
    }
  }

  private static async showVersionInfo(): Promise<void> {
    const header = chalk.blueBright('📦 Version Information')

    try {
      const versionInfo = await getVersionInfo()

      let versionContent = chalk.cyan.bold(`Current Version: `) + chalk.white(versionInfo.current)

      if (versionInfo.error) {
        versionContent += '\n' + chalk.yellow(`⚠️  ${versionInfo.error}`)
      } else if (versionInfo.latest) {
        versionContent += '\n' + chalk.cyan(`Latest Version: `) + chalk.white(versionInfo.latest)

        if (versionInfo.hasUpdate) {
          versionContent += '\n\n' + chalk.green.bold('🚀 Update Available!')
          versionContent += '\n' + chalk.white('Run the following command to update:')
          versionContent += '\n' + chalk.yellow.bold('npm update -g @nicomatt69/nikcli')
        } else {
          versionContent += '\n\n' + chalk.green('✓ You are using the latest version!')
        }
      }

      const versionBox = boxen(versionContent, {
        padding: 1,
        borderStyle: 'round',
        borderColor: versionInfo.hasUpdate ? 'green' : 'cyan',
        backgroundColor: versionInfo.hasUpdate ? '#001a00' : '#001a2a',
        title: versionInfo.hasUpdate ? 'Update Available' : 'Version Status',
      })

      OnboardingModule.renderSection([header, versionBox])
    } catch (_error: any) {
      const warningBox = boxen(chalk.yellow(`⚠️ Unable to check version`), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
        backgroundColor: '#2a1a00',
        title: 'Version Status',
      })

      OnboardingModule.renderSection([header, warningBox])
    }
  }
}

/**
 * System Requirements Module
 */
class SystemModule {
  static lastOllamaStatus: boolean | undefined
  static async checkApiKeys(): Promise<boolean> {
    // Allow running without API keys when using an Ollama model
    try {
      const currentModel = configManager.get('currentModel')
      const modelCfg = (configManager.get('models') as any)[currentModel]
      if (modelCfg && modelCfg.provider === 'ollama') {
        return true
      }
    } catch (_) {
      // ignore config read errors, fall back to env checks
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    const openaiKey = process.env.OPENAI_API_KEY
    const openrouterKey = process.env.OPENROUTER_API_KEY
    const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    const vercelKey = process.env.V0_API_KEY
    const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY
    return !!(anthropicKey || openaiKey || openrouterKey || googleKey || vercelKey || gatewayKey)
  }

  static checkNodeVersion(): boolean {
    // Prefer Bun if present
    try {
      {
        return true
      }
      // Bun exists at runtime when using Bun
    } catch (_) {
      // ignore and fall back to Node check
    }

    const version = process.version
    const major = parseInt(version.slice(1).split('.')[0])

    if (major < 18) {
      return false
    }

    return true
  }

  static async checkOllamaAvailability(): Promise<boolean> {
    // Only enforce when current provider is Ollama
    try {
      const currentModel = configManager.get('currentModel')
      const modelCfg = (configManager.get('models') as any)[currentModel]
      if (!modelCfg || modelCfg.provider !== 'ollama') {
        // Not applicable – clear status indicator
        SystemModule.lastOllamaStatus = undefined
        return true
      }
    } catch (_) {
      return true // don't block if config is unreadable
    }

    try {
      const host = process.env.OLLAMA_HOST || '127.0.0.1:11434'
      const base = host.startsWith('http') ? host : `http://${host}`
      const res = await fetch(`${base}/api/tags`, { method: 'GET' } as any)
      if (!res.ok) {
        SystemModule.lastOllamaStatus = false
        return false
      }
      const data: any = await res.json().catch(() => null)
      if (!data || !Array.isArray(data.models)) {
        // Unexpected response from Ollama - silent
      } else {
        const currentModel = configManager.get('currentModel')
        const modelCfg = (configManager.get('models') as any)[currentModel]
        const name = modelCfg?.model
        const present = data.models.some((m: any) => m?.name === name || m?.model === name)
        if (!present && name) {
          // Offer to pull the model now
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          })
          const answer: string = await new Promise((resolve) =>
            rl.question(`Pull model now with "ollama pull ${name}"? (Y/n): `, resolve)
          )
          rl.close()

          if (!answer || answer.toLowerCase().startsWith('y')) {
            const code: number = await new Promise<number>((resolve) => {
              const child = spawn('ollama', ['pull', name], {
                stdio: 'inherit',
              })
              child.on('close', (code) => resolve(code ?? 1))
              child.on('error', () => resolve(1))
            })
            if (code === 0) {
              // Model pulled successfully - silent
            } else {
              SystemModule.lastOllamaStatus = false
              return false
            }
          } else {
            SystemModule.lastOllamaStatus = false
            return false
          }
        }
      }
      SystemModule.lastOllamaStatus = true
      return true
    } catch (_err) {
      SystemModule.lastOllamaStatus = false
      return false
    }
  }

  static async checkSystemRequirements(): Promise<boolean> {
    const checks = [
      SystemModule.checkNodeVersion(),
      await SystemModule.checkApiKeys(),
      await SystemModule.checkOllamaAvailability(),
    ]
    const allPassed = checks.every((r) => r)
    return allPassed
  }
}

/**
 * Service Initialization Module
 */
class ServiceModule {
  private static initialized = false
  private static agentManager: AgentManager | null = null

  static async initializeServices(): Promise<void> {
    const workingDir = process.cwd()

    // Set working directory for all services
    toolService.setWorkingDirectory(workingDir)
    planningService.setWorkingDirectory(workingDir)
    lspService.setWorkingDirectory(workingDir)
    diffManager.setAutoAccept(true)

    // Initialize memory and snapshot services
    await memoryService.initialize()
    await snapshotService.initialize()
  }

  static async initializeAgents(): Promise<void> {
    // Create and initialize the core AgentManager
    if (!ServiceModule.agentManager) {
      ServiceModule.agentManager = new AgentManager(configManager as any)
      await ServiceModule.agentManager.initialize()
    }

    // Register agent classes (e.g., UniversalAgent)
    registerAgents(ServiceModule.agentManager)

    // Ensure at least one agent instance is created (universal-agent)
    try {
      await ServiceModule.agentManager.createAgent('universal-agent')
    } catch (_) {
      // If already created or creation failed silently, proceed
    }

    const agents = ServiceModule.agentManager.listAgents()
  }

  static async initializeTools(): Promise<void> {
    const tools = toolService.getAvailableTools()
  }

  static async initializePlanning(): Promise<void> {
    // Planning system initialization
  }

  static async initializeSecurity(): Promise<void> {
    // Security policies loading
  }

  static async initializeContext(): Promise<void> {
    // Context management initialization
  }

  static async initializeEnhancedServices(): Promise<void> {
    const config = configManager.getAll()

    try {
      // Initialize cache service (always available with fallback)
      try {
        // cacheService initializes automatically in constructor
      } catch (_error: any) {
        // Cache service warning - silent
      }

      // Initialize Redis cache if enabled
      if (config.redis?.enabled) {
        try {
          // redisProvider initializes connection automatically
        } catch (_error: any) {
          // Redis connection warning - silent
        }
      }

      // Initialize Supabase if enabled
      if (config.supabase?.enabled) {
        try {
          // Add error listener to prevent unhandled promise rejections
          enhancedSupabaseProvider.on('error', (_error: any) => {
            // Supabase Provider Error - silent
          })

          // enhancedSupabaseProvider and authProvider initialize automatically
        } catch (_error: any) {
          // Supabase initialization warning - silent
        }
      }

      // Initialize enhanced token cache

      // Initialize vision and image providers for autonomous capabilities
      try {
        // Import providers to make them available for autonomous chat
        const { visionProvider } = await import('./providers/vision')
        const { imageGenerator } = await import('./providers/image')

          // Providers initialize automatically in their constructors

          // Make providers globally accessible for chat
          ; (global as any).visionProvider = visionProvider
          ; (global as any).imageGenerator = imageGenerator
      } catch (_error: any) { }

      // Initialize CAD/GCode provider and services once at startup
      try {
        const { cadGcodeProvider } = await import('./providers/cad-gcode')
        const { getCadService, getGcodeService } = await import('./services/cad-gcode-service')

        await cadGcodeProvider.initialize()

          // Expose globally for command handlers and autonomous flows
          ; (global as any).cadGcodeProvider = cadGcodeProvider
          ; (global as any).cadService = getCadService()
          ; (global as any).gcodeService = getGcodeService()
      } catch (_error: any) {
        // Silent: CAD/GCode provider optional
      }
    } catch (_error: any) {
      // Enhanced services failed - silent
      // Don't throw error to allow system to continue with basic functionality
    }
  }

  static async initializeSystem(): Promise<boolean> {
    if (ServiceModule.initialized) return true

    const steps = [
      { name: 'Services', fn: ServiceModule.initializeServices.bind(ServiceModule) },
      {
        name: 'Enhanced Services',
        fn: ServiceModule.initializeEnhancedServices.bind(ServiceModule),
      },
      { name: 'Agents', fn: ServiceModule.initializeAgents.bind(ServiceModule) },
      { name: 'Tools', fn: ServiceModule.initializeTools.bind(ServiceModule) },
      { name: 'Planning', fn: ServiceModule.initializePlanning.bind(ServiceModule) },
      { name: 'Security', fn: ServiceModule.initializeSecurity.bind(ServiceModule) },
      { name: 'Context', fn: ServiceModule.initializeContext.bind(ServiceModule) },
    ]

    for (const step of steps) {
      try {
        await step.fn()
      } catch (error: any) {
        return false
      }
    }

    ServiceModule.initialized = true
    return true
  }
}

/**
 * Streaming Orchestrator Module
 */
class StreamingModule extends EventEmitter {
  private rl: readline.Interface
  private context: StreamContext
  private policyManager: ExecutionPolicyManager
  private messageQueue: StreamMessage[] = []
  private processingMessage = false
  private activeAgents = new Map<string, any>()
  private messageProcessorInterval?: NodeJS.Timeout
  private keypressHandler?: (str: any, key: any) => void
  private eventHandlers: Map<string, (...args: any[]) => void> = new Map()
  private cleanupCompleted = false

  constructor() {
    super()

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 300,
      completer: (line: string, callback: (err: any, result: [string[], string]) => void) => {
        this.autoComplete(line)
          .then((result) => callback(null, result))
          .catch((err) => callback(err, [[], line]))
      },
    })

    this.context = {
      workingDirectory: process.cwd(),
      autonomous: true,
      planMode: false,
      autoAcceptEdits: true,
      contextLeft: 20,
      maxContext: 100,
    }

    this.policyManager = new ExecutionPolicyManager(configManager)
    this.setupInterface()
    this.startMessageProcessor()
  }

  private setupInterface(): void {
    // Raw mode for better control
    if (process.stdin.isTTY) {
      require('readline').emitKeypressEvents(process.stdin)
      if (!(process.stdin as any).isRaw) {
        ; (process.stdin as any).setRawMode(true)
      }
      ; (process.stdin as any).resume()
    }

    // Keypress handlers
    this.keypressHandler = (str, key) => {
      if (key && key.name === 'slash' && !this.processingMessage) {
        setTimeout(() => this.showCommandMenu(), 50)
      }

      if (key && key.name === 'tab' && key.shift) {
        this.cycleMode()
      }

      if (key && key.name === 'c' && key.ctrl) {
        if (this.activeAgents.size > 0) {
          this.stopAllAgents()
        } else {
          this.gracefulExit()
        }
      }
    }
    process.stdin.on('keypress', this.keypressHandler)

    // Input handler
    const lineHandler = async (input: string) => {
      const trimmed = input.trim()
      if (!trimmed) {
        this.showPrompt()
        return
      }

      await this.queueUserInput(trimmed)
      this.showPrompt()
    }
    this.eventHandlers.set('line', lineHandler)
    this.rl.on('line', lineHandler)

    const closeHandler = () => {
      this.gracefulExit()
    }
    this.eventHandlers.set('close', closeHandler)
    this.rl.on('close', closeHandler)

    this.setupServiceListeners()
  }

  private setupServiceListeners(): void {
    // Agent events
    agentService.on('task_start', (task) => {
      this.activeAgents.set(task.id, task)
      this.queueMessage({
        type: 'system',
        content: `🔌 Agent ${task.agentType} started: ${task.task.slice(0, 50)}...`,
        metadata: { agentId: task.id, agentType: task.agentType },
      })
    })

    agentService.on('task_progress', (task, update) => {
      this.queueMessage({
        type: 'agent',
        content: `📊 ${task.agentType}: ${update.progress}% ${update.description || ''}`,
        metadata: { agentId: task.id, progress: update.progress },
        agentId: task.id,
        progress: update.progress,
      })
    })
  }

  private queueMessage(message: Partial<StreamMessage>): void {
    const fullMessage: StreamMessage = {
      id: Date.now().toString(),
      timestamp: new Date(),
      status: 'queued',
      ...message,
    } as StreamMessage

    this.messageQueue.push(fullMessage)
  }

  private async queueUserInput(input: string): Promise<void> {
    this.queueMessage({
      type: 'user',
      content: input,
    })
  }

  private showPrompt(): void {
    const dir = require('node:path').basename(this.context.workingDirectory)
    const agents = this.activeAgents.size

    // Use IDE-aware formatter for prompt
    const idePrompt = ideAwareFormatter.createPrompt({
      workingDir: this.context.workingDirectory,
      mode: this.context.planMode ? 'plan' : undefined,
      agentCount: agents > 0 ? agents : undefined
    })

    const modes = []
    if (this.context.planMode) modes.push(chalk.cyan('plan'))
    if (this.context.autoAcceptEdits) modes.push(chalk.green('auto-accept'))
    const modeStr = modes.length > 0 ? `─[${modes.join(' ')}]` : ''

    const contextStr = chalk.dim(`${this.context.contextLeft}%`)

    // Model/provider badge with Ollama status dot
    let modelBadge = ''
    try {
      const currentModel = configManager.get('currentModel')
      const models = (configManager.get('models') as any) || {}
      const modelCfg = models[currentModel] || {}
      const provider = modelCfg.provider || 'unknown'
      // Status dot only meaningful for Ollama
      let dot = chalk.dim('●')
      if (provider === 'ollama') {
        if (SystemModule.lastOllamaStatus === true) dot = chalk.green('●')
        else if (SystemModule.lastOllamaStatus === false) dot = chalk.red('●')
        else dot = chalk.yellow('●')
      }
      const prov = chalk.magenta(provider)
      const name = chalk.white(currentModel || 'model')
      modelBadge = `${prov}:${name}${provider === 'ollama' ? ` ${dot}` : ''}`
    } catch (_) {
      modelBadge = chalk.gray('model:unknown')
    }

    // Assistant status dot: green when active (with …), red when waiting for input
    const statusDot = this.processingMessage ? chalk.green('●') + chalk.dim('…') : chalk.red('●')
    const statusBadge = `asst:${statusDot}`

    // Use IDE-aware prompt if available, otherwise fallback to default
    const prompt = ideDetector.hasGUI() ?
      idePrompt + `${modeStr}─[${contextStr}]─[${statusBadge}]─[${modelBadge}]\n└─❯ ` :
      `\n┌─[🎛️:${chalk.green(dir)}${modeStr}]─[${contextStr}]─[${statusBadge}]─[${modelBadge}]\n└─❯ `

    this.rl.setPrompt(prompt)
    this.rl.prompt()
  }

  private async autoComplete(line: string): Promise<[string[], string]> {
    try {
      // Use the smart completion manager for intelligent completions
      const { smartCompletionManager } = await import('./core/smart-completion-manager')

      const completions = await smartCompletionManager.getCompletions(line, {
        currentDirectory: process.cwd(),
        interface: 'default',
      })

      // Convert to readline format
      const suggestions = completions.map((comp) => comp.completion)
      return [suggestions.length ? suggestions : [], line]
    } catch (_error) {
      // Fallback to original static completion
      const commands = ['/status', '/agents', '/diff', '/accept', '/clear', '/help']
      const agents = [
        '@react-expert',
        '@backend-expert',
        '@frontend-expert',
        '@devops-expert',
        '@code-review',
        '@autonomous-coder',
      ]

      const all = [...commands, ...agents]
      const hits = all.filter((c) => c.startsWith(line))
      return [hits.length ? hits : all, line]
    }
  }

  private showCommandMenu(): void {
    const lines: string[] = []
    lines.push(`${chalk.bold('📋 Available Commands')}`)
    lines.push('')
    lines.push(`${chalk.green('/help')}     Show detailed help`)
    lines.push(`${chalk.green('/agents')}   List available agents`)
    lines.push(`${chalk.green('/status')}   Show system status`)
    lines.push(`${chalk.green('/clear')}    Clear session`)
    const content = lines.join('\n')
    console.log(
      boxen(content, {
        padding: { top: 0, right: 2, bottom: 0, left: 2 },
        margin: { top: 1, right: 0, bottom: 0, left: 0 },
        borderStyle: 'round',
        borderColor: 'cyan',
        title: chalk.cyan('Command Menu'),
        titleAlignment: 'center',
      })
    )
  }

  private cycleMode(): void {
    this.context.planMode = !this.context.planMode
    console.log(this.context.planMode ? chalk.green('\n✓ Plan mode enabled') : chalk.yellow('\n⚠️ Plan mode disabled'))
  }

  private stopAllAgents(): void {
    this.activeAgents.clear()
    console.log(chalk.yellow('\n⏹️ Stopped all active agents'))
  }

  private startMessageProcessor(): void {
    this.messageProcessorInterval = setInterval(() => {
      if (!this.processingMessage) {
        this.processNextMessage()
      }
    }, 100)
  }

  private processNextMessage(): void {
    const message = this.messageQueue.find((m) => m.status === 'queued')
    if (!message) return

    this.processingMessage = true
    message.status = 'processing'
    // Update prompt to reflect active status
    this.showPrompt()

    // Process message based on type
    setTimeout(() => {
      message.status = 'completed'
      this.processingMessage = false
      // Update prompt to reflect idle status
      this.showPrompt()
    }, 100)
  }

  private cleanup(): void {
    if (this.cleanupCompleted) return
    this.cleanupCompleted = true

    try {
      // Stop message processor
      if (this.messageProcessorInterval) {
        clearInterval(this.messageProcessorInterval)
        this.messageProcessorInterval = undefined
      }

      // Remove keypress handler
      if (this.keypressHandler) {
        process.stdin.removeListener('keypress', this.keypressHandler)
        this.keypressHandler = undefined
      }

      // Remove event handlers
      if (this.rl) {
        this.eventHandlers.forEach((handler, event) => {
          this.rl.removeListener(event, handler)
        })
        this.eventHandlers.clear()
      }

      // Reset raw mode
      try {
        if (process.stdin.isTTY && (process.stdin as any).isRaw) {
          ; (process.stdin as any).setRawMode(false)
        }
      } catch (error) {
        // Ignore
      }

      // Clear data structures
      this.activeAgents.clear()
      this.messageQueue = []
    } catch (error: any) {
      console.error('Cleanup error:', error.message)
    }
  }

  private gracefulExit(): void {
    console.log(chalk.blue('\n👋 Shutting down orchestrator...'))

    if (this.activeAgents.size > 0) {
      console.log(chalk.yellow(`⏳ Waiting for ${this.activeAgents.size} agents to finish...`))
    }

    this.cleanup()
    console.log(chalk.green('✓ Goodbye!'))
    process.exit(0)
  }

  async start(): Promise<void> {
    this.showPrompt()

    return new Promise<void>((resolve) => {
      const resolveHandler = () => {
        this.cleanup()
        resolve()
      }
      this.rl.on('close', resolveHandler)
    })
  }
}

/**
 * Main Orchestrator - Unified Entry Point
 */
class MainOrchestrator {
  private streamingModule?: StreamingModule
  private initialized = false

  constructor() {
    this.setupGlobalHandlers()
  }

  private setupGlobalHandlers(): void {
    // Global error handler
    process.on('unhandledRejection', (reason, promise) => {
      console.error(chalk.red('❌ Unhandled Rejection:'), reason)
    })

    process.on('uncaughtException', (error) => {
      console.error(chalk.red('❌ Uncaught Exception:'), error)
      this.gracefulShutdown()
    })

    // Graceful shutdown handlers
    process.on('SIGTERM', this.gracefulShutdown.bind(this))
    process.on('SIGINT', this.gracefulShutdown.bind(this))
  }

  private async gracefulShutdown(): Promise<void> {
    console.log(chalk.yellow('\n🛑 Shutting down orchestrator...'))

    try {
      // Stop autonomous interface if running (not used in unified NikCLI entrypoint)
      // No specific stop required here

      // Stop streaming module if running
      if (this.streamingModule) {
        // Streaming module handles its own cleanup
      }

      console.log(chalk.green('✓ Orchestrator shut down cleanly'))
    } catch (error) {
      console.error(chalk.red('❌ Error during shutdown:'), error)
    } finally {
      process.exit(0)
    }
  }

  async start(): Promise<void> {
    try {
      // Silence background loggers during onboarding so only curated UI appears
      Logger.setConsoleOutput(false)
      UtilsLogger.getInstance().setConsoleOutput(false)

      // Run onboarding flow
      const onboardingComplete = await OnboardingModule.runOnboarding()
      if (!onboardingComplete) {
        console.log(chalk.yellow('\n⚠️ Onboarding incomplete. Please address the issues above.'))
        process.exit(1)
      }

      // Initialize all systems
      const initialized = await ServiceModule.initializeSystem()
      if (!initialized) {
        console.log(chalk.red('\n❌ Cannot start - system initialization failed'))
        process.exit(1)
      }

      // Re-enable console logging
      Logger.setConsoleOutput(true)
      UtilsLogger.getInstance().setConsoleOutput(true)

      // Welcome message

      // Show quick start guide

      const cli = new NikCLI()
      await cli.startChat({
        // Enable structured UI mode from the start
        structuredUI: true,
      })
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to start orchestrator:'), error)
      process.exit(1)
    }
  }
}

/**
 * Main entry point function
 */
async function main() {
  // Parse command line arguments
  const argv = process.argv.slice(2)

  // Check for ACP mode
  if (argv.includes('--acp') || argv.includes('acp') || process.env.NIKCLI_MODE === 'acp') {
    try {
      // Import ACP functionality
      const { runAcpCli } = await import('./acp')
      await runAcpCli()
      return
    } catch (err: any) {
      console.error(chalk.red('ACP mode failed:'), err?.message || err)
      process.exit(1)
    }
  }

  // Minimal non-interactive report mode for CI/VS Code
  if (argv[0] === 'report' || argv.includes('--report')) {
    try {
      const { generateReports } = await import('./commands/report')
      const getFlag = (name: string) => {
        const i = argv.indexOf(`--${name}`)
        return i !== -1 ? argv[i + 1] : undefined
      }
      const out = getFlag('out')
      const report = getFlag('report')
      const depthStr = getFlag('depth')
      const model = getFlag('model')
      const depth = depthStr ? parseInt(depthStr, 10) : undefined
      await generateReports({ out, report, depth, model })
      return
    } catch (err: any) {
      console.error(chalk.red('Report generation failed:'), err?.message || err)
      process.exit(1)
    }
  }

  const orchestrator = new MainOrchestrator()
  await orchestrator.start()
}

// Start the application
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('❌ Startup failed:'), error)
    process.exit(1)
  })
}

// Export for programmatic use
export { main, MainOrchestrator, IntroductionModule, OnboardingModule, SystemModule, ServiceModule, StreamingModule }
