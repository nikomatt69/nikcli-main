import chalk from 'chalk'
import boxen from 'boxen'
import inquirer from 'inquirer'
import { configManager } from '../core/config-manager'
import { advancedAIProvider } from '../ai/advanced-ai-provider'
import { inputQueue } from '../core/input-queue'

/**
 * ConfigurationPanels - Handles configuration UI panels
 * Extracted from lines 18809-19671 in nik-cli.ts
 */
export class ConfigurationPanels {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async showConfigurationPanel(): Promise<void> {
    try {
      const cfg = configManager.getConfig()

      const lines: string[] = []
      lines.push(chalk.cyan.bold('⚙️  System Configuration'))
      lines.push(chalk.gray('─'.repeat(60)))

      // 1) General
      lines.push('')
      lines.push(chalk.green('1) General'))
      lines.push(`   Current Model: ${chalk.yellow(cfg.currentModel)}`)
      lines.push(`   Temperature: ${chalk.cyan(String(cfg.temperature))}`)
      lines.push(`   Max Tokens: ${chalk.cyan(String(cfg.maxTokens))}`)
      lines.push(
        `   Chat History: ${cfg.chatHistory ? chalk.green('on') : chalk.gray('off')} (max ${cfg.maxHistoryLength})`
      )
      if (cfg.systemPrompt) {
        const preview = cfg.systemPrompt.length > 80 ? `${cfg.systemPrompt.slice(0, 77)}…` : cfg.systemPrompt
        lines.push(`   System Prompt: ${chalk.gray(preview)}`)
      }
      lines.push(`   Auto Analyze Workspace: ${cfg.autoAnalyzeWorkspace ? chalk.green('on') : chalk.gray('off')}`)

      // 2) Auto Todos
      lines.push('')
      lines.push(chalk.green('2) Auto Todos'))
      const requireExplicit = (cfg as any).autoTodo?.requireExplicitTrigger === true
      lines.push(
        `   Mode: ${requireExplicit ? chalk.yellow('Explicit only (use "todo")') : chalk.green('Automatic (complex input allowed)')}`
      )
      lines.push(`   Toggle: ${chalk.cyan('/todos on')} | ${chalk.cyan('/todos off')} | ${chalk.cyan('/todos status')}`)

      // 3) Model Routing
      lines.push('')
      lines.push(chalk.green('3) Model Routing'))
      lines.push(`   Enabled: ${cfg.modelRouting.enabled ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Verbose: ${cfg.modelRouting.verbose ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Mode: ${chalk.cyan(cfg.modelRouting.mode)}`)

      // 4) Agents
      lines.push('')
      lines.push(chalk.green('4) Agents'))
      lines.push(`   Max Concurrent Agents: ${chalk.cyan(String(cfg.maxConcurrentAgents))}`)
      lines.push(`   Guidance System: ${cfg.enableGuidanceSystem ? chalk.green('on') : chalk.gray('off')}`)
      lines.push(`   Default Agent Timeout: ${chalk.cyan(String(cfg.defaultAgentTimeout))} ms`)
      lines.push(`   Log Level: ${chalk.cyan(cfg.logLevel)}`)

      // 5) Security
      lines.push('')
      lines.push(chalk.green('5) Security'))
      lines.push(
        `   Require Network Approval: ${cfg.requireApprovalForNetwork ? chalk.green('yes') : chalk.gray('no')}`
      )
      lines.push(`   Approval Policy: ${chalk.cyan(cfg.approvalPolicy)}`)
      lines.push(`   Security Mode: ${chalk.cyan(cfg.securityMode)}`)

      // 6) Tool Approval Policies
      lines.push('')
      lines.push(chalk.green('6) Tool Approval Policies'))
      Object.entries(cfg.toolApprovalPolicies).forEach(([k, v]) => {
        lines.push(`   ${k}: ${chalk.cyan(String(v))}`)
      })

      // 7) Session Settings
      lines.push('')
      lines.push(chalk.green('7) Session Settings'))
      lines.push(`   Approval Timeout: ${chalk.cyan(String(cfg.sessionSettings.approvalTimeoutMs))} ms`)
      lines.push(`   Dev Mode Timeout: ${chalk.cyan(String(cfg.sessionSettings.devModeTimeoutMs))} ms`)
      lines.push(
        `   Batch Approval: ${cfg.sessionSettings.batchApprovalEnabled ? chalk.green('on') : chalk.gray('off')}`
      )
      lines.push(
        `   Auto-Approve ReadOnly: ${cfg.sessionSettings.autoApproveReadOnly ? chalk.green('on') : chalk.gray('off')}`
      )

      // 8) Sandbox
      lines.push('')
      lines.push(chalk.green('8) Sandbox'))
      lines.push(`   Enabled: ${cfg.sandbox.enabled ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   File System: ${cfg.sandbox.allowFileSystem ? chalk.green('allowed') : chalk.red('blocked')}`)
      lines.push(`   Network: ${cfg.sandbox.allowNetwork ? chalk.green('allowed') : chalk.red('blocked')}`)
      lines.push(`   Commands: ${cfg.sandbox.allowCommands ? chalk.green('allowed') : chalk.red('blocked')}`)
      lines.push(`   Trusted Domains: ${chalk.cyan(String(cfg.sandbox.trustedDomains.length))}`)

      // 9) Redis
      lines.push('')
      lines.push(chalk.green('9) Redis'))
      lines.push(`   Enabled: ${cfg.redis.enabled ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(
        `   Host: ${chalk.cyan(cfg.redis.host)}  Port: ${chalk.cyan(String(cfg.redis.port))}  DB: ${chalk.cyan(String(cfg.redis.database))}`
      )
      lines.push(
        `   TTL: ${chalk.cyan(String(cfg.redis.ttl))}s  Retries: ${chalk.cyan(String(cfg.redis.maxRetries))}  Delay: ${chalk.cyan(String(cfg.redis.retryDelayMs))}ms`
      )
      lines.push(`   Cluster: ${cfg.redis.cluster?.enabled ? chalk.green('on') : chalk.gray('off')}`)
      lines.push(
        `   Fallback: ${cfg.redis.fallback.enabled ? chalk.green('on') : chalk.gray('off')} (${chalk.cyan(cfg.redis.fallback.strategy)})`
      )
      lines.push(
        `   Strategies: tokens=${cfg.redis.strategies.tokens ? 'on' : 'off'}, sessions=${cfg.redis.strategies.sessions ? 'on' : 'off'}, agents=${cfg.redis.strategies.agents ? 'on' : 'off'}, docs=${cfg.redis.strategies.documentation ? 'on' : 'off'}`
      )

      // 10) Supabase
      lines.push('')
      lines.push(chalk.green('10) Supabase'))
      lines.push(`   Enabled: ${cfg.supabase.enabled ? chalk.green('yes') : chalk.gray('no')}`)
      if (cfg.supabase.url) lines.push(`   URL: ${chalk.cyan(cfg.supabase.url)}`)
      lines.push(
        `   Features: db=${cfg.supabase.features.database ? 'on' : 'off'}, storage=${cfg.supabase.features.storage ? 'on' : 'off'}, auth=${cfg.supabase.features.auth ? 'on' : 'off'}, realtime=${cfg.supabase.features.realtime ? 'on' : 'off'}, vector=${cfg.supabase.features.vector ? 'on' : 'off'}`
      )
      lines.push(
        `   Tables: sessions=${cfg.supabase.tables.sessions}, blueprints=${cfg.supabase.tables.blueprints}, users=${cfg.supabase.tables.users}, metrics=${cfg.supabase.tables.metrics}, docs=${cfg.supabase.tables.documents}`
      )

      // 11) Cloud Docs
      lines.push('')
      lines.push(chalk.green('11) Cloud Docs'))
      lines.push(`   Enabled: ${cfg.cloudDocs.enabled ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Provider: ${chalk.cyan(cfg.cloudDocs.provider)}`)
      lines.push(
        `   Auto Sync: ${cfg.cloudDocs.autoSync ? 'on' : 'off'}  Contribution: ${cfg.cloudDocs.contributionMode ? 'on' : 'off'}`
      )
      lines.push(`   Max Context: ${chalk.cyan(String(cfg.cloudDocs.maxContextSize))}`)
      lines.push(
        `   Auto Load For Agents: ${cfg.cloudDocs.autoLoadForAgents ? 'on' : 'off'}  Smart Suggestions: ${cfg.cloudDocs.smartSuggestions ? 'on' : 'off'}`
      )

      // 12) AI Providers & API Keys
      lines.push('')
      lines.push(chalk.green('12) AI Providers & API Keys'))
      const anthropicKey = configManager.getApiKey('anthropic') || process.env.ANTHROPIC_API_KEY
      const openaiKey = configManager.getApiKey('openai') || process.env.OPENAI_API_KEY
      const googleKey = configManager.getApiKey('google') || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      const gatewayKey = configManager.getApiKey('gateway') || process.env.AI_GATEWAY_API_KEY
      const v0Key = configManager.getApiKey('vercel') || process.env.V0_API_KEY
      const ollamaHost = process.env.OLLAMA_HOST || '127.0.0.1:11434'

      lines.push(`   Anthropic (Claude): ${anthropicKey ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   OpenAI (GPT): ${openaiKey ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   Google (Gemini): ${googleKey ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   AI Gateway: ${gatewayKey ? chalk.green('✓ configured') : chalk.gray('❌ optional')}`)
      lines.push(`   V0 (Vercel): ${v0Key ? chalk.green('✓ configured') : chalk.gray('❌ optional')}`)
      lines.push(`   Ollama: ${chalk.cyan(ollamaHost)} ${ollamaHost ? chalk.gray('(local)') : chalk.red('❌ missing')}`)

      // 13) Blockchain & Web3 (Coinbase)
      lines.push('')
      lines.push(chalk.green('13) Blockchain & Web3 (Coinbase)'))
      const coinbaseId = configManager.getApiKey('coinbase_id')
      const coinbaseSecret = configManager.getApiKey('coinbase_secret')
      const coinbaseWallet = configManager.getApiKey('coinbase_wallet_secret')
      lines.push(`   CDP API Key ID: ${coinbaseId ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   CDP API Key Secret: ${coinbaseSecret ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   CDP Wallet Secret: ${coinbaseWallet ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      const coinbaseReady = coinbaseId && coinbaseSecret && coinbaseWallet
      lines.push(
        `   Status: ${coinbaseReady ? chalk.green('Ready for Web3 operations') : chalk.yellow('Configure with /set-coin-keys')}`
      )

      // 14) Web Browsing & Analysis (Browserbase)
      lines.push('')
      lines.push(chalk.green('14) Web Browsing & Analysis (Browserbase)'))
      const browserbaseKey = configManager.getApiKey('browserbase')
      const browserbaseProject = configManager.getApiKey('browserbase_project_id')
      lines.push(`   API Key: ${browserbaseKey ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      lines.push(`   Project ID: ${browserbaseProject ? chalk.green('✓ configured') : chalk.red('❌ missing')}`)
      const browserbaseReady = browserbaseKey && browserbaseProject
      lines.push(
        `   Status: ${browserbaseReady ? chalk.green('Ready for web browsing') : chalk.yellow('Configure with /set-key-bb')}`
      )
      if (browserbaseReady) {
        const availableProviders = ['claude', 'openai', 'google'].filter((p) => configManager.getApiKey(p))
        lines.push(
          `   AI Providers: ${availableProviders.length > 0 ? chalk.cyan(availableProviders.join(', ')) : chalk.gray('none available')}`
        )
      }

      // 15) Vector Database & Memory (ChromaDB)
      lines.push('')
      lines.push(chalk.green('15) Vector Database & Memory (ChromaDB)'))
      const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8005'
      const chromaApiKey = process.env.CHROMA_API_KEY || process.env.CHROMA_CLOUD_API_KEY
      lines.push(`   URL: ${chalk.cyan(chromaUrl)}`)
      lines.push(`   API Key: ${chromaApiKey ? chalk.green('✓ configured') : chalk.gray('❌ optional (local)')}`)
      lines.push(
        `   Status: ${chromaUrl.includes('localhost') ? chalk.yellow('Local instance') : chalk.green('Cloud instance')}`
      )

      // 16) Cache Services (Upstash Redis)
      lines.push('')
      lines.push(chalk.green('16) Cache Services (Upstash Redis)'))
      const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
      const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
      lines.push(`   REST URL: ${upstashUrl ? chalk.green('✓ configured') : chalk.gray('❌ optional')}`)
      lines.push(`   REST Token: ${upstashToken ? chalk.green('✓ configured') : chalk.gray('❌ optional')}`)
      const upstashReady = upstashUrl && upstashToken
      lines.push(
        `   Status: ${upstashReady ? chalk.green('Cloud Redis ready') : chalk.gray('Using local Redis fallback')}`
      )

      // 17) Models & API Keys (sorted by name)
      lines.push('')
      lines.push(chalk.green('17) Models & API Keys'))
      const modelEntries = Object.entries(cfg.models).sort((a, b) => a[0].localeCompare(b[0]))
      modelEntries.forEach(([name, mc]) => {
        const isCurrent = name === cfg.currentModel
        const hasKey = configManager.getApiKey(name) !== undefined
        const bullet = isCurrent ? chalk.yellow('●') : chalk.gray('○')
        const keyStatus = hasKey ? chalk.green('✓ key') : chalk.red('❌ key')
        lines.push(`   ${bullet} ${chalk.cyan(name)}  (${(mc as any).provider}/${(mc as any).model})  ${keyStatus}`)
      })

      // 18) MCP Servers Configuration
      lines.push('')
      lines.push(chalk.green('18) MCP Servers Configuration'))
      const mcpConfig = (cfg as any).mcp || {}
      const mcpServers = Object.entries(mcpConfig)
      if (mcpServers.length > 0) {
        lines.push(`   Total Servers: ${chalk.cyan(String(mcpServers.length))}`)
        mcpServers.forEach(([name, server]: [string, any]) => {
          const enabled = server.enabled !== false
          const serverType = server.type || 'unknown'
          const statusIcon = enabled ? chalk.green('✓') : chalk.gray('○')
          const typeLabel = serverType === 'local' ? chalk.cyan('local') : chalk.blue('remote')
          lines.push(`   ${statusIcon} ${name} (${typeLabel})`)
          if (server.capabilities && server.capabilities.length > 0) {
            lines.push(`      Capabilities: ${chalk.gray(server.capabilities.join(', '))}`)
          }
        })
      } else {
        lines.push(`   ${chalk.gray('No MCP servers configured')}`)
      }

      // 19) Middleware System
      lines.push('')
      lines.push(chalk.green('19) Middleware System'))
      const middleware = (cfg as any).middleware || {}
      lines.push(`   Enabled: ${middleware.enabled !== false ? chalk.green('yes') : chalk.gray('no')}`)
      if (middleware.security) {
        lines.push(
          `   Security: ${middleware.security.enabled ? chalk.green('on') : chalk.gray('off')} (priority: ${chalk.cyan(String(middleware.security.priority))})`
        )
        lines.push(`      Strict Mode: ${middleware.security.strictMode ? chalk.green('yes') : chalk.gray('no')}`)
        lines.push(
          `      Require Approval: ${middleware.security.requireApproval ? chalk.green('yes') : chalk.gray('no')}`
        )
        lines.push(`      Risk Threshold: ${chalk.cyan(middleware.security.riskThreshold || 'medium')}`)
      }
      if (middleware.logging) {
        lines.push(
          `   Logging: ${middleware.logging.enabled ? chalk.green('on') : chalk.gray('off')} (priority: ${chalk.cyan(String(middleware.logging.priority))})`
        )
        lines.push(`      Log Level: ${chalk.cyan(middleware.logging.logLevel || 'info')}`)
        lines.push(`      Log to File: ${middleware.logging.logToFile ? chalk.green('yes') : chalk.gray('no')}`)
        lines.push(`      Sanitize Data: ${middleware.logging.sanitizeData ? chalk.green('yes') : chalk.gray('no')}`)
      }
      if (middleware.performance) {
        lines.push(
          `   Performance: ${middleware.performance.enabled ? chalk.green('on') : chalk.gray('off')} (priority: ${chalk.cyan(String(middleware.performance.priority))})`
        )
        lines.push(`      Track Memory: ${middleware.performance.trackMemory ? chalk.green('yes') : chalk.gray('no')}`)
        lines.push(
          `      Slow Execution Threshold: ${chalk.cyan(String(middleware.performance.slowExecutionThreshold || 5000))}ms`
        )
      }

      // 20) Reasoning Configuration
      lines.push('')
      lines.push(chalk.green('20) Reasoning Configuration'))
      const reasoning = (cfg as any).reasoning || {}
      lines.push(
        `   Global Reasoning: ${reasoning.enabled !== false ? chalk.green('enabled') : chalk.gray('disabled')}`
      )
      lines.push(`   Auto-Detect Models: ${reasoning.autoDetect !== false ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Show Process: ${reasoning.showReasoningProcess ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Log Reasoning: ${reasoning.logReasoning ? chalk.green('yes') : chalk.gray('no')}`)

      // 21) Embedding Provider
      lines.push('')
      lines.push(chalk.green('21) Embedding Provider'))
      const embeddingProvider = (cfg as any).embeddingProvider || {}
      lines.push(`   Default Provider: ${chalk.cyan(embeddingProvider.default || 'openai')}`)
      if (embeddingProvider.fallbackChain && embeddingProvider.fallbackChain.length > 0) {
        lines.push(`   Fallback Chain: ${chalk.gray(embeddingProvider.fallbackChain.join(' → '))}`)
      }
      lines.push(
        `   Cost Optimization: ${embeddingProvider.costOptimization !== false ? chalk.green('yes') : chalk.gray('no')}`
      )
      lines.push(
        `   Auto-Switch on Failure: ${embeddingProvider.autoSwitchOnFailure !== false ? chalk.green('yes') : chalk.gray('no')}`
      )

      // 22) Diff Display
      lines.push('')
      lines.push(chalk.green('22) Diff Display'))
      const diff = (cfg as any).diff || {}
      lines.push(`   Enabled: ${diff.enabled !== false ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Style: ${chalk.cyan(diff.style || 'unified')}`)
      lines.push(`   Theme: ${chalk.cyan(diff.theme || 'auto')}`)
      lines.push(`   Line Numbers: ${diff.showLineNumbers !== false ? chalk.green('yes') : chalk.gray('no')}`)
      lines.push(`   Context Lines: ${chalk.cyan(String(diff.contextLines !== undefined ? diff.contextLines : 3))}`)
      lines.push(`   Syntax Highlighting: ${diff.syntaxHighlight !== false ? chalk.green('yes') : chalk.gray('no')}`)

      // 23) Output Style Configuration
      lines.push('')
      lines.push(chalk.green('23) Output Style Configuration'))
      const outputStyle = (cfg as any).outputStyle || {}
      lines.push(`   Default Style: ${chalk.cyan(outputStyle.defaultStyle || 'production-focused')}`)
      if (outputStyle.customizations) {
        lines.push(`   Verbosity Level: ${chalk.cyan(String(outputStyle.customizations.verbosityLevel || 5))}`)
        lines.push(
          `   Include Code Examples: ${outputStyle.customizations.includeCodeExamples !== false ? chalk.green('yes') : chalk.gray('no')}`
        )
        lines.push(
          `   Include Step-by-Step: ${outputStyle.customizations.includeStepByStep !== false ? chalk.green('yes') : chalk.gray('no')}`
        )
        lines.push(`   Max Response Length: ${chalk.cyan(outputStyle.customizations.maxResponseLength || 'medium')}`)
      }

      const configBox = boxen(lines.join('\n'), {
        title: '⚙️  Configuration Panel',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
      this.nikCLI.printPanel(configBox, 'general')
      this.nikCLI.printPanel(
        boxen('Tip: Use /config interactive to edit settings', {
          title: 'Config Tip',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        }),
        'general'
      )
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to show configuration: ${error.message}`))
    }
  }

  async showInteractiveConfiguration(): Promise<void> {
    // Prevent user input queue interference during interactive prompts
    try {
      this.nikCLI.suspendPrompt()
    } catch {
      // Ignore errors
    }
    try {
      inputQueue.enableBypass()
    } catch {
      // Ignore errors
    }

    try {
      const sectionChoices = [
        { name: 'General', value: 'general' },
        { name: 'Auto Todos', value: 'autotodos' },
        { name: 'Model Routing', value: 'routing' },
        { name: 'Agents', value: 'agents' },
        { name: 'Security', value: 'security' },
        { name: 'Session Settings', value: 'session' },
        { name: 'Sandbox', value: 'sandbox' },
        { name: 'Models & Keys', value: 'models' },
        { name: 'Middleware', value: 'middleware' },
        { name: 'Reasoning', value: 'reasoning' },
        { name: 'Embedding Provider', value: 'embedding' },
        { name: 'Diff Display', value: 'diff' },
        { name: 'Output Style', value: 'outputstyle' },
        { name: 'MCP Servers', value: 'mcp' },
        { name: 'Exit', value: 'exit' },
      ]

      const asNumber = (v: any, min?: number, max?: number) => {
        const n = Number(v)
        if (!Number.isFinite(n)) return 'Enter a number'
        if (min !== undefined && n < min) return `Min ${min}`
        if (max !== undefined && n > max) return `Max ${max}`
        return true
      }

      // Loop until user exits
      let done = false
      while (!done) {
        const { section } = await inquirer.prompt<{ section: string }>([
          {
            type: 'list',
            name: 'section',
            message: 'Configuration — select section',
            choices: sectionChoices,
          },
        ])

        const cfg = this.nikCLI.configManager.getAll() as any

        switch (section) {
          case 'general': {
            const ans = await inquirer.prompt([
              {
                type: 'input',
                name: 'temperature',
                message: 'Temperature (0–2)',
                default: cfg.temperature,
                validate: (v: any) => asNumber(v, 0, 2),
              },
              {
                type: 'input',
                name: 'maxTokens',
                message: 'Max tokens',
                default: cfg.maxTokens,
                validate: (v: any) => asNumber(v, 1, 800000),
              },
              { type: 'confirm', name: 'chatHistory', message: 'Enable chat history?', default: cfg.chatHistory },
              {
                type: 'input',
                name: 'maxHistoryLength',
                message: 'Max history length',
                default: cfg.maxHistoryLength,
                validate: (v: any) => asNumber(v, 1, 5000),
              },
            ])
            this.nikCLI.configManager.set('temperature', Number(ans.temperature) as any)
            this.nikCLI.configManager.set('maxTokens', Number(ans.maxTokens) as any)
            this.nikCLI.configManager.set('chatHistory', Boolean(ans.chatHistory) as any)
            this.nikCLI.configManager.set('maxHistoryLength', Number(ans.maxHistoryLength) as any)
            console.log(chalk.green('✓ Updated General settings'))
            break
          }
          case 'autotodos': {
            const current = !!cfg.autoTodo?.requireExplicitTrigger
            const { requireExplicitTrigger } = await inquirer.prompt<{ requireExplicitTrigger: boolean }>([
              {
                type: 'confirm',
                name: 'requireExplicitTrigger',
                message: 'Require explicit "todo" to trigger?',
                default: current,
              },
            ])
            this.nikCLI.configManager.set('autoTodo', { ...(cfg.autoTodo || {}), requireExplicitTrigger } as any)
            console.log(chalk.green('✓ Updated Auto Todos settings'))
            break
          }
          case 'routing': {
            const { enabled, verbose, mode } = await inquirer.prompt([
              { type: 'confirm', name: 'enabled', message: 'Enable routing?', default: cfg.modelRouting.enabled },
              {
                type: 'confirm',
                name: 'verbose',
                message: 'Verbose routing logs?',
                default: cfg.modelRouting.verbose,
              },
              {
                type: 'list',
                name: 'mode',
                message: 'Routing mode',
                choices: ['conservative', 'balanced', 'aggressive'],
                default: cfg.modelRouting.mode,
              },
            ])
            this.nikCLI.configManager.set('modelRouting', { enabled, verbose, mode } as any)
            console.log(chalk.green('✓ Updated Model Routing'))
            break
          }
          case 'agents': {
            const { maxConcurrentAgents, enableGuidanceSystem, defaultAgentTimeout, logLevel } =
              await inquirer.prompt([
                {
                  type: 'input',
                  name: 'maxConcurrentAgents',
                  message: 'Max concurrent agents',
                  default: cfg.maxConcurrentAgents,
                  validate: (v: any) => asNumber(v, 1, 10),
                },
                {
                  type: 'confirm',
                  name: 'enableGuidanceSystem',
                  message: 'Enable guidance system?',
                  default: cfg.enableGuidanceSystem,
                },
                {
                  type: 'input',
                  name: 'defaultAgentTimeout',
                  message: 'Default agent timeout (ms)',
                  default: cfg.defaultAgentTimeout,
                  validate: (v: any) => asNumber(v, 1000, 3600000),
                },
                {
                  type: 'list',
                  name: 'logLevel',
                  message: 'Log level',
                  choices: ['debug', 'info', 'warn', 'error'],
                  default: cfg.logLevel,
                },
              ])
            this.nikCLI.configManager.set('maxConcurrentAgents', Number(maxConcurrentAgents) as any)
            this.nikCLI.configManager.set('enableGuidanceSystem', Boolean(enableGuidanceSystem) as any)
            this.nikCLI.configManager.set('defaultAgentTimeout', Number(defaultAgentTimeout) as any)
            this.nikCLI.configManager.set('logLevel', logLevel as any)
            console.log(chalk.green('✓ Updated Agent settings'))
            break
          }
          case 'security': {
            const { requireApprovalForNetwork, approvalPolicy, securityMode } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'requireApprovalForNetwork',
                message: 'Require approval for network requests?',
                default: cfg.requireApprovalForNetwork,
              },
              {
                type: 'list',
                name: 'approvalPolicy',
                message: 'Approval policy',
                choices: ['strict', 'moderate', 'permissive'],
                default: cfg.approvalPolicy,
              },
              {
                type: 'list',
                name: 'securityMode',
                message: 'Security mode',
                choices: ['safe', 'default', 'developer'],
                default: cfg.securityMode,
              },
            ])
            this.nikCLI.configManager.set('requireApprovalForNetwork', Boolean(requireApprovalForNetwork) as any)
            this.nikCLI.configManager.set('approvalPolicy', approvalPolicy as any)
            this.nikCLI.configManager.set('securityMode', securityMode as any)
            console.log(chalk.green('✓ Updated Security settings'))
            break
          }
          case 'session': {
            const s = cfg.sessionSettings
            const a = await inquirer.prompt([
              {
                type: 'input',
                name: 'approvalTimeoutMs',
                message: 'Approval timeout (ms)',
                default: s.approvalTimeoutMs,
                validate: (v: any) => asNumber(v, 5000, 300000),
              },
              {
                type: 'input',
                name: 'devModeTimeoutMs',
                message: 'Dev mode timeout (ms)',
                default: s.devModeTimeoutMs,
                validate: (v: any) => asNumber(v, 60000, 7200000),
              },
              {
                type: 'confirm',
                name: 'batchApprovalEnabled',
                message: 'Enable batch approvals?',
                default: s.batchApprovalEnabled,
              },
              {
                type: 'confirm',
                name: 'autoApproveReadOnly',
                message: 'Auto approve read-only?',
                default: s.autoApproveReadOnly,
              },
            ])
            this.nikCLI.configManager.set('sessionSettings', {
              approvalTimeoutMs: Number(a.approvalTimeoutMs),
              devModeTimeoutMs: Number(a.devModeTimeoutMs),
              batchApprovalEnabled: Boolean(a.batchApprovalEnabled),
              autoApproveReadOnly: Boolean(a.autoApproveReadOnly),
            } as any)
            console.log(chalk.green('✓ Updated Session settings'))
            break
          }
          case 'sandbox': {
            const s = cfg.sandbox
            const a = await inquirer.prompt([
              { type: 'confirm', name: 'enabled', message: 'Enable sandbox?', default: s.enabled },
              {
                type: 'confirm',
                name: 'allowFileSystem',
                message: 'Allow file system?',
                default: s.allowFileSystem,
              },
              { type: 'confirm', name: 'allowNetwork', message: 'Allow network?', default: s.allowNetwork },
              { type: 'confirm', name: 'allowCommands', message: 'Allow commands?', default: s.allowCommands },
            ])
            this.nikCLI.configManager.set('sandbox', { ...s, ...a } as any)
            console.log(chalk.green('✓ Updated Sandbox settings'))
            break
          }
          case 'models': {
            const list = this.nikCLI.configManager.listModels()
            if (!list || list.length === 0) {
              console.log(chalk.yellow('No models configured'))
              break
            }
            const { selection } = await inquirer.prompt<{ selection: string }>([
              {
                type: 'list',
                name: 'selection',
                message: 'Models',
                choices: [
                  { name: 'Set current model', value: 'setcurrent' },
                  { name: 'Set API key', value: 'setkey' },
                  { name: 'Back', value: 'back' },
                ],
              },
            ])
            if (selection === 'setcurrent') {
              const { model } = await inquirer.prompt<{ model: string }>([
                {
                  type: 'list',
                  name: 'model',
                  message: 'Choose current model',
                  choices: list.map((m: any) => ({
                    name: `${m.name} (${(m.config as any).provider})`,
                    value: m.name,
                  })),
                  default: this.nikCLI.configManager.getCurrentModel(),
                },
              ])
              this.nikCLI.configManager.setCurrentModel(model)
              try {
                advancedAIProvider.setModel(model)
              } catch {
                /* ignore */
              }
              console.log(chalk.green(`✓ Current model set: ${model}`))
            } else if (selection === 'setkey') {
              await this.nikCLI.interactiveSetApiKey()
            }
            break
          }
          case 'middleware': {
            const m = cfg.middleware
            const security = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'enabled',
                message: 'Enable security middleware?',
                default: m.security.enabled,
              },
              {
                type: 'list',
                name: 'riskThreshold',
                message: 'Risk threshold',
                choices: ['low', 'medium', 'high'],
                default: m.security.riskThreshold,
              },
            ])
            const logging = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'enabled',
                message: 'Enable logging middleware?',
                default: m.logging.enabled,
              },
              {
                type: 'list',
                name: 'logLevel',
                message: 'Log level',
                choices: ['debug', 'info', 'warn', 'error'],
                default: m.logging.logLevel,
              },
            ])
            const performance = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'enabled',
                message: 'Enable performance middleware?',
                default: m.performance.enabled,
              },
              {
                type: 'input',
                name: 'slowThreshold',
                message: 'Slow execution threshold (ms)',
                default: m.performance.slowExecutionThreshold,
                validate: (v: any) => asNumber(v, 100, 60000),
              },
            ])
            this.nikCLI.configManager.set('middleware', {
              ...m,
              security: { ...m.security, ...security },
              logging: { ...m.logging, ...logging },
              performance: { ...m.performance, slowExecutionThreshold: Number(performance.slowThreshold) },
            } as any)
            console.log(chalk.green('✓ Updated Middleware settings'))
            break
          }
          case 'reasoning': {
            const r = cfg.reasoning
            const ans = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'enabled',
                message: 'Enable reasoning globally?',
                default: r.enabled,
              },
              {
                type: 'confirm',
                name: 'autoDetect',
                message: 'Auto-detect reasoning models?',
                default: r.autoDetect,
              },
              {
                type: 'confirm',
                name: 'showReasoningProcess',
                message: 'Show reasoning process to user?',
                default: r.showReasoningProcess,
              },
              {
                type: 'confirm',
                name: 'logReasoning',
                message: 'Log reasoning to debug?',
                default: r.logReasoning,
              },
            ])
            this.nikCLI.configManager.set('reasoning', ans as any)
            console.log(chalk.green('✓ Updated Reasoning settings'))
            break
          }
          case 'embedding': {
            const e = cfg.embeddingProvider
            const ans = await inquirer.prompt([
              {
                type: 'list',
                name: 'default',
                message: 'Default provider',
                choices: ['openai', 'google', 'anthropic', 'openrouter'],
                default: e.default,
              },
              {
                type: 'confirm',
                name: 'costOptimization',
                message: 'Enable cost optimization?',
                default: e.costOptimization,
              },
              {
                type: 'confirm',
                name: 'autoSwitchOnFailure',
                message: 'Auto-switch on failure?',
                default: e.autoSwitchOnFailure,
              },
            ])
            this.nikCLI.configManager.set('embeddingProvider', { ...e, ...ans } as any)
            console.log(chalk.green('✓ Updated Embedding Provider settings'))
            break
          }
          case 'diff': {
            const d = cfg.diff
            const ans = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'enabled',
                message: 'Enable diff display?',
                default: d.enabled,
              },
              {
                type: 'list',
                name: 'style',
                message: 'Diff style',
                choices: ['unified', 'side-by-side', 'compact'],
                default: d.style,
              },
              {
                type: 'list',
                name: 'theme',
                message: 'Theme',
                choices: ['dark', 'light', 'auto'],
                default: d.theme,
              },
              {
                type: 'confirm',
                name: 'showLineNumbers',
                message: 'Show line numbers?',
                default: d.showLineNumbers,
              },
              {
                type: 'input',
                name: 'contextLines',
                message: 'Context lines',
                default: d.contextLines,
                validate: (v: any) => asNumber(v, 0, 10),
              },
            ])
            this.nikCLI.configManager.set('diff', { ...d, ...ans, contextLines: Number(ans.contextLines) } as any)
            console.log(chalk.green('✓ Updated Diff Display settings'))
            break
          }
          case 'outputstyle': {
            const o = cfg.outputStyle
            const { defaultStyle } = await inquirer.prompt([
              {
                type: 'list',
                name: 'defaultStyle',
                message: 'Default output style',
                choices: ['production-focused', 'balanced', 'detailed', 'minimal', 'educational'],
                default: o.defaultStyle,
              },
            ])
            if (o.customizations) {
              const custom = await inquirer.prompt([
                {
                  type: 'input',
                  name: 'verbosityLevel',
                  message: 'Verbosity level (1-10)',
                  default: o.customizations.verbosityLevel,
                  validate: (v: any) => asNumber(v, 1, 10),
                },
                {
                  type: 'confirm',
                  name: 'includeCodeExamples',
                  message: 'Include code examples?',
                  default: o.customizations.includeCodeExamples,
                },
                {
                  type: 'confirm',
                  name: 'includeStepByStep',
                  message: 'Include step-by-step?',
                  default: o.customizations.includeStepByStep,
                },
                {
                  type: 'list',
                  name: 'maxResponseLength',
                  message: 'Max response length',
                  choices: ['short', 'medium', 'long'],
                  default: o.customizations.maxResponseLength,
                },
              ])
              this.nikCLI.configManager.set('outputStyle', {
                ...o,
                defaultStyle,
                customizations: {
                  ...o.customizations,
                  ...custom,
                  verbosityLevel: Number(custom.verbosityLevel),
                },
              } as any)
            } else {
              this.nikCLI.configManager.set('outputStyle', { ...o, defaultStyle } as any)
            }
            console.log(chalk.green('✓ Updated Output Style settings'))
            break
          }
          case 'mcp': {
            const mcpServers = cfg.mcp || {}
            const serverNames = Object.keys(mcpServers)
            if (serverNames.length === 0) {
              console.log(chalk.yellow('No MCP servers configured. Edit config.json directly to add servers.'))
              break
            }
            const { action } = await inquirer.prompt<{ action: string }>([
              {
                type: 'list',
                name: 'action',
                message: 'MCP Servers',
                choices: [
                  { name: 'Enable/Disable server', value: 'toggle' },
                  { name: 'View server details', value: 'view' },
                  { name: 'Back', value: 'back' },
                ],
              },
            ])
            if (action === 'toggle') {
              const { serverName } = await inquirer.prompt<{ serverName: string }>([
                {
                  type: 'list',
                  name: 'serverName',
                  message: 'Select server',
                  choices: serverNames.map((name) => ({
                    name: `${name} (${mcpServers[name].enabled ? '✓ enabled' : '○ disabled'})`,
                    value: name,
                  })),
                },
              ])
              const server = mcpServers[serverName]
              const { enabled } = await inquirer.prompt([
                { type: 'confirm', name: 'enabled', message: `Enable ${serverName}?`, default: server.enabled },
              ])
              server.enabled = enabled
              this.nikCLI.configManager.set('mcp', mcpServers as any)
              console.log(chalk.green(`✓ ${serverName} ${enabled ? 'enabled' : 'disabled'}`))
            } else if (action === 'view') {
              const { serverName } = await inquirer.prompt<{ serverName: string }>([
                { type: 'list', name: 'serverName', message: 'Select server', choices: serverNames },
              ])
              const server = mcpServers[serverName]
              console.log(chalk.blue(`\nMCP Server: ${serverName}`))
              console.log(`  Type: ${server.type}`)
              console.log(`  Enabled: ${server.enabled ? 'yes' : 'no'}`)
              if (server.type === 'local' && server.command) console.log(`  Command: ${server.command.join(' ')}`)
              if (server.type === 'remote' && server.url) console.log(`  URL: ${server.url}`)
              if (server.capabilities) console.log(`  Capabilities: ${server.capabilities.join(', ')}`)
            }
            break
          }
          default:
            done = true
            break
        }
      }

      console.log(chalk.dim('Exited interactive configuration'))
    } finally {
      // Always disable bypass and restore prompt
      try {
        inputQueue.disableBypass()
      } catch {
        // Ignore errors
      }
      process.stdout.write('')
      await new Promise((resolve) => setTimeout(resolve, 150))
      this.nikCLI.renderPromptAfterOutput()
    }
  }
}
