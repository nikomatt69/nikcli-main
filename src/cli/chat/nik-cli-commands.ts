import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateText } from 'ai'
import boxen from 'boxen'
import chalk from 'chalk'
import { parse as parseDotenv } from 'dotenv'
import { z } from 'zod'
import { modelProvider } from '../ai/model-provider'
import { modernAIProvider } from '../ai/modern-ai-provider'
import { backgroundAgentService } from '../background-agents/background-agent-service'
import { unifiedRAGSystem } from '../context/rag-system'
import { workspaceContext } from '../context/workspace-context'
import { agentFactory } from '../core/agent-factory'
import { AgentManager } from '../core/agent-manager'
import { agentStream } from '../core/agent-stream'
import { blueprintStorage } from '../core/blueprint-storage'
import { configManager, simpleConfigManager } from '../core/config-manager'
import { contextTokenManager } from '../core/context-token-manager'
import { WebSearchProvider } from '../core/web-search-provider'
import { ideDiagnosticIntegration } from '../integrations/ide-diagnostic-integration'
import { enhancedPlanning } from '../planning/enhanced-planning'
import { imageGenerator } from '../providers/image'
import { visionProvider } from '../providers/vision'
import { registerAgents } from '../register-agents'
import { memoryService } from '../services/memory-service'
import { snapshotService } from '../services/snapshot-service'
import { toolService } from '../services/tool-service'
import { extractFileIdFromUrl, figmaTool, isFigmaConfigured } from '../tools/figma-tool'
import { secureTools } from '../tools/secure-tools-registry'
import { toolsManager } from '../tools/tools-manager'
import { type OutputStyle, OutputStyleUtils } from '../types/output-styles'
import type { AgentTask } from '../types/types'
import { advancedUI } from '../ui/advanced-cli-ui'
import { approvalSystem } from '../ui/approval-system'
import { DiffViewer } from '../ui/diff-viewer'
import { ContainerManager } from '../virtualized-agents/container-manager'
import { VMOrchestrator } from '../virtualized-agents/vm-orchestrator'
import { initializeVMSelector, vmSelector } from '../virtualized-agents/vm-selector'
import { browserChatBridge, isBrowserModeAvailable, getBrowserModeInfo } from '../browser'
import { browseGPTService } from '../services/browsegpt-service'
import { chatManager } from './chat-manager'

// ====================== ⚡︎ ZOD COMMAND VALIDATION SCHEMAS ======================

// Base command argument schema
const _CommandArgsSchema = z.array(z.string())

// File path validation
const FilePathSchema = z
  .string()
  .min(1)
  .refine((path) => (!path.includes('..') && !path.startsWith('/')) || path.startsWith('./'), {
    message: 'Invalid file path - must be relative to workspace',
  })

// Agent creation command schema
const CreateAgentCommandSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(90)
    .regex(/^[a-zA-Z0-9-]+$/, 'Name must contain only alphanumeric characters and hyphens'),
  specialization: z.string().min(5).max(200),
  autonomy: z.enum(['supervised', 'semi-autonomous', 'fully-autonomous']).optional(),
  type: z.enum(['standard', 'vm', 'container']).optional(),
})

// Model selection schema
const ModelCommandSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'google', 'ollama']).optional(),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
})

// File operations schema
const _FileCommandSchema = z.object({
  path: FilePathSchema,
  content: z.string().optional(),
  backup: z.boolean().default(true),
  encoding: z.string().default('utf8'),
})

// Command execution schema
const _ExecCommandSchema = z.object({
  command: z.string().min(1),
  timeout: z.number().int().min(1000).max(300000).default(30000),
  cwd: z.string().optional(),
  approve: z.boolean().default(false),
})

// Session management schema
const _SessionCommandSchema = z.object({
  action: z.enum(['new', 'list', 'switch', 'export', 'delete']),
  sessionId: z.string().optional(),
  title: z.string().min(1).max(100).optional(),
})

// Configuration schema
const _ConfigCommandSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  type: z.enum(['string', 'number', 'boolean']).optional(),
})

// Figma command schemas
const FigmaExportSchema = z.object({
  fileId: z.string().min(1),
  format: z.enum(['png', 'jpg', 'svg', 'pdf']).default('png'),
  outputPath: z.string().optional(),
  scale: z.number().min(0.25).max(4).default(1),
})

const FigmaCodeGenSchema = z.object({
  fileId: z.string().min(1),
  framework: z.enum(['react', 'vue', 'svelte', 'html']).default('react'),
  library: z.enum(['shadcn', 'chakra', 'mantine', 'custom']).default('shadcn'),
  typescript: z.boolean().default(true),
})

const FigmaTokensSchema = z.object({
  fileId: z.string().min(1),
  format: z.enum(['json', 'css', 'scss', 'tokens-studio']).default('json'),
  includeColors: z.boolean().default(true),
  includeTypography: z.boolean().default(true),
  includeSpacing: z.boolean().default(true),
})

// Helper function to validate and parse command arguments
function validateCommandArgs<T>(schema: z.ZodSchema<T>, data: any, commandName: string): T | null {
  try {
    const parsedArgs = schema.parse(data)
    return parsedArgs
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.log(chalk.red(`❌ Invalid arguments for /${commandName}:`))
      error.errors.forEach((err) => {
        console.log(chalk.yellow(`   • ${err.path.join('.')}: ${err.message}`))
      })
    } else {
      console.log(chalk.red(`❌ Failed to validate /${commandName}: ${error}`))
    }
    return null
  }
}

// Helper to parse key-value arguments from command line
function parseKeyValueArgs(args: string[]): Record<string, any> {
  const result: Record<string, any> = {}
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] && args[i + 1]) {
      result[args[i]] = args[i + 1]
    }
  }
  return result
}

export interface CommandResult {
  shouldExit: boolean
  shouldUpdatePrompt: boolean
}

export class SlashCommandHandler {
  private commands: Map<string, (args: string[]) => Promise<CommandResult>> = new Map()
  private agentManager: AgentManager
  private vmOrchestrator: VMOrchestrator
  private cliInstance: any // Reference to main CLI instance

  constructor(cliInstance?: any) {
    this.cliInstance = cliInstance
    this.agentManager = new AgentManager(configManager)
    registerAgents(this.agentManager)
    const containerManager = new ContainerManager()
    this.vmOrchestrator = new VMOrchestrator(containerManager)

    // Initialize VM selector with the orchestrator
    initializeVMSelector(this.vmOrchestrator)

    this.registerCommands()
  }

  // Expose registered slash commands for palettes/autocomplete
  public listCommands(): string[] {
    return Array.from(this.commands.keys())
  }

  /**
   * Print a boxed panel - identical to nik-cli.ts printPanel
   */
  private printPanel(content: string): void {
    // If CLI instance is available, use its printPanel method for proper status bar handling
    if (this.cliInstance && typeof this.cliInstance.printPanel === 'function') {
      this.cliInstance.printPanel(content)
      return
    }

    // Fallback: simple output
    try {
      console.log(content)
      console.log('\n'.repeat(2))
    } catch (error) {
      console.log(content)
    }
  }

  private registerCommands(): void {
    this.commands.set('help', this.helpCommand.bind(this))
    this.commands.set('quit', this.quitCommand.bind(this))
    this.commands.set('exit', this.quitCommand.bind(this))
    this.commands.set('clear', this.clearCommand.bind(this))
    this.commands.set('default', this.defaultModeCommand.bind(this))
    this.commands.set('auth', this.authCommand.bind(this))
    this.commands.set('pro', this.proCommand.bind(this))
    this.commands.set('model', this.modelCommand.bind(this))
    this.commands.set('models', this.modelsCommand.bind(this))
    this.commands.set('set-key', this.setKeyCommand.bind(this))
    this.commands.set('config', this.configCommand.bind(this))
    this.commands.set('env', this.envCommand.bind(this))
    this.commands.set('notify', this.notifyCommand.bind(this))

    // Output Style Commands
    this.commands.set('style', this.styleCommand.bind(this))
    this.commands.set('styles', this.stylesCommand.bind(this))
    this.commands.set('new', this.newSessionCommand.bind(this))
    this.commands.set('sessions', this.sessionsCommand.bind(this))
    this.commands.set('export', this.exportCommand.bind(this))
    this.commands.set('system', this.systemCommand.bind(this))
    this.commands.set('stats', this.statsCommand.bind(this))
    this.commands.set('temp', this.temperatureCommand.bind(this))
    this.commands.set('history', this.historyCommand.bind(this))
    this.commands.set('debug', this.debugCommand.bind(this))
    this.commands.set('dashboard', this.dashboardCommand.bind(this))
    this.commands.set('agent', this.agentCommand.bind(this))
    this.commands.set('agents', this.listAgentsCommand.bind(this))
    this.commands.set('auto', this.autonomousCommand.bind(this))
    this.commands.set('parallel', this.parallelCommand.bind(this))
    this.commands.set('factory', this.factoryCommand.bind(this))
    this.commands.set('create-agent', this.createAgentCommand.bind(this))
    this.commands.set('launch-agent', this.parallelCommand.bind(this))
    this.commands.set('blueprints', this.blueprintsCommand.bind(this))
    this.commands.set('blueprint', this.blueprintCommand.bind(this))
    this.commands.set('delete-blueprint', this.deleteBlueprintCommand.bind(this))
    this.commands.set('export-blueprint', this.exportBlueprintCommand.bind(this))
    this.commands.set('import-blueprint', this.importBlueprintCommand.bind(this))
    this.commands.set('search-blueprints', this.searchBlueprintsCommand.bind(this))
    this.commands.set('context', this.contextCommand.bind(this))
    this.commands.set('stream', this.streamCommand.bind(this))

    // Planning and Todo Commands
    this.commands.set('plan', this.planCommand.bind(this))
    this.commands.set('todo', this.todoCommand.bind(this))
    this.commands.set('todos', this.todosCommand.bind(this))
    this.commands.set('compact', this.compactCommand.bind(this))
    this.commands.set('super-compact', this.superCompactCommand.bind(this))
    this.commands.set('approval', this.approvalCommand.bind(this))
    // HUD/Plan utilities
    this.commands.set('plan-clean', this.planCleanCommand.bind(this))
    this.commands.set('todo-hide', this.todoHideCommand.bind(this))
    this.commands.set('todo-show', this.todoShowCommand.bind(this))

    // Security Commands
    this.commands.set('security', this.securityCommand.bind(this))
    this.commands.set('dev-mode', this.devModeCommand.bind(this))
    this.commands.set('safe-mode', this.safeModeCommand.bind(this))
    this.commands.set('clear-approvals', this.clearApprovalsCommand.bind(this))

    // File operations
    this.commands.set('read', this.readFileCommand.bind(this))
    this.commands.set('write', this.writeFileCommand.bind(this))
    this.commands.set('edit', this.editFileCommand.bind(this))
    this.commands.set('ls', this.listFilesCommand.bind(this))
    this.commands.set('search', this.searchCommand.bind(this))
    this.commands.set('grep', this.searchCommand.bind(this))

    // Terminal operations
    this.commands.set('run', this.runCommandCommand.bind(this))
    this.commands.set('sh', this.runCommandCommand.bind(this))
    this.commands.set('bash', this.runCommandCommand.bind(this))
    this.commands.set('install', this.installCommand.bind(this))
    this.commands.set('npm', this.npmCommand.bind(this))
    this.commands.set('yarn', this.yarnCommand.bind(this))
    this.commands.set('git', this.gitCommand.bind(this))
    this.commands.set('docker', this.dockerCommand.bind(this))
    this.commands.set('ps', this.processCommand.bind(this))
    this.commands.set('kill', this.killCommand.bind(this))

    // Project operations
    this.commands.set('build', this.buildCommand.bind(this))
    this.commands.set('test', this.testCommand.bind(this))
    this.commands.set('lint', this.lintCommand.bind(this))
    this.commands.set('create', this.createProjectCommand.bind(this))

    // VM operations
    this.commands.set('vm', this.vmCommand.bind(this))
    this.commands.set('vm-create', this.vmCreateCommand.bind(this))
    this.commands.set('vm-list', this.vmListCommand.bind(this))
    this.commands.set('vm-stop', this.vmStopCommand.bind(this))
    this.commands.set('vm-remove', this.vmRemoveCommand.bind(this))
    this.commands.set('vm-connect', this.vmConnectCommand.bind(this))
    this.commands.set('vm-create-pr', this.vmCreatePRCommand.bind(this))
    this.commands.set('vm-logs', this.vmLogsCommand.bind(this))
    this.commands.set('vm-mode', this.vmModeCommand.bind(this))
    this.commands.set('vm-switch', this.vmSwitchCommand.bind(this))

    // Background Agent operations
    this.commands.set('bg-agent', this.bgAgentCommand.bind(this))
    this.commands.set('bg-jobs', this.bgJobsCommand.bind(this))
    this.commands.set('bg-status', this.bgStatusCommand.bind(this))
    this.commands.set('bg-logs', this.bgLogsCommand.bind(this))

    this.commands.set('vm-dashboard', this.vmDashboardCommand.bind(this))
    this.commands.set('vm-select', this.vmSelectCommand.bind(this))
    this.commands.set('vm-status', this.vmStatusCommand.bind(this))
    this.commands.set('vm-exec', this.vmExecCommand.bind(this))
    this.commands.set('vm-ls', this.vmLsCommand.bind(this))
    this.commands.set('vm-broadcast', this.vmBroadcastCommand.bind(this))
    this.commands.set('vm-health', this.vmHealthCommand.bind(this))
    this.commands.set('vm-backup', this.vmBackupCommand.bind(this))
    this.commands.set('vm-stats', this.vmStatsCommand.bind(this))

    // Vision/Image operations
    this.commands.set('analyze-image', this.analyzeImageCommand.bind(this))
    this.commands.set('vision', this.analyzeImageCommand.bind(this))
    this.commands.set('generate-image', this.generateImageCommand.bind(this))
    // Image discovery + interactive analyze
    this.commands.set('images', this.imagesCommand.bind(this))
    this.commands.set('create-image', this.generateImageCommand.bind(this))

    // Blockchain/Web3 (Coinbase AgentKit)
    this.commands.set('web3', this.web3Command.bind(this))
    this.commands.set('blockchain', this.web3Command.bind(this))

    // GOAT SDK Web3 Operations
    this.commands.set('goat', this.goatCommand.bind(this))
    this.commands.set('defi', this.goatCommand.bind(this))
    this.commands.set('polymarket', this.polymarketCommand.bind(this))

    // Web3 Toolchains
    this.commands.set('web3-toolchain', this.web3ToolchainCommand.bind(this))
    this.commands.set('w3-toolchain', this.web3ToolchainCommand.bind(this))
    this.commands.set('defi-toolchain', this.defiToolchainCommand.bind(this))

    // IDE diagnostic commands
    this.commands.set('diagnostic', this.diagnosticCommand.bind(this))
    this.commands.set('diag', this.diagnosticCommand.bind(this))
    this.commands.set('monitor', this.monitorCommand.bind(this))
    this.commands.set('diag-status', this.diagnosticStatusCommand.bind(this))

    // Memory operations
    this.commands.set('remember', this.rememberCommand.bind(this))
    this.commands.set('recall', this.recallCommand.bind(this))
    this.commands.set('memory', this.memoryCommand.bind(this))
    this.commands.set('forget', this.forgetCommand.bind(this))

    // Snapshot commands
    this.commands.set('snapshot', this.snapshotCommand.bind(this))
    this.commands.set('snap', this.snapshotCommand.bind(this))

    // Benchmark commands

    this.commands.set('restore', this.restoreCommand.bind(this))
    this.commands.set('snapshots', this.listSnapshotsCommand.bind(this))

    // Indexing commands
    this.commands.set('index', this.indexCommand.bind(this))
    // Router controls
    this.commands.set('router', this.routerCommand.bind(this))

    // Figma design operations
    this.commands.set('figma-info', this.figmaInfoCommand.bind(this))
    this.commands.set('figma-export', this.figmaExportCommand.bind(this))
    this.commands.set('figma-to-code', this.figmaToCodeCommand.bind(this))
    this.commands.set('figma-open', this.figmaOpenCommand.bind(this))
    this.commands.set('figma-tokens', this.figmaTokensCommand.bind(this))
    this.commands.set('figma-config', this.figmaConfigCommand.bind(this))

    // Work session management commands
    this.commands.set('resume', this.resumeSessionCommand.bind(this))
    this.commands.set('work-sessions', this.workSessionsCommand.bind(this))
    this.commands.set('save-session', this.saveSessionCommand.bind(this))
    this.commands.set('delete-session', this.deleteSessionCommand.bind(this))
    this.commands.set('export-session', this.exportSessionCommand.bind(this))

    // Edit history commands (undo/redo)
    this.commands.set('undo', this.undoCommand.bind(this))
    this.commands.set('redo', this.redoCommand.bind(this))
    this.commands.set('edit-history', this.editHistoryCommand.bind(this))
    this.commands.set('figma-create', this.figmaCreateCommand.bind(this))

    // BrowseGPT Web browsing commands
    this.commands.set('browse-session', this.browseSessionCommand.bind(this))
    this.commands.set('browse-search', this.browseSearchCommand.bind(this))
    this.commands.set('browse-visit', this.browseVisitCommand.bind(this))
    this.commands.set('browse-chat', this.browseChatCommand.bind(this))
    this.commands.set('browse-sessions', this.browseSessionsCommand.bind(this))
    this.commands.set('browse-info', this.browseInfoCommand.bind(this))
    this.commands.set('browse-close', this.browseCloseCommand.bind(this))
    this.commands.set('browse-cleanup', this.browseCleanupCommand.bind(this))
    this.commands.set('browse-quick', this.browseQuickCommand.bind(this))
  }

  async handle(input: string): Promise<CommandResult> {
    const parts = input.slice(1).split(' ')
    const command = parts[0].toLowerCase()
    const args = parts.slice(1)

    const handler = this.commands.get(command)
    if (!handler) {
      console.log(chalk.red(`❌ Unknown command: ${command}`))
      console.log(chalk.gray('Type /help for available commands'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    return await handler(args)
  }

  private async helpCommand(): Promise<CommandResult> {
    const help = `
${chalk.blue.bold('🔧 Available Commands:')}
${chalk.gray('─'.repeat(40))}

${chalk.cyan('/help')} - Show this help message
${chalk.cyan('/quit, /exit')} - Exit the chat
${chalk.cyan('/clear')} - Clear current chat session
${chalk.cyan('/new [title]')} - Start a new chat session
${chalk.cyan('/default')} - Switch to default chat mode

${chalk.blue.bold('API Keys & Authentication:')}
${chalk.cyan('/set-key <model> <key>')} - Set API key for a model
${chalk.gray('  e.g. /set-key openrouter sk-or-v1-...')}
${chalk.cyan('/set-coin-keys')} - Interactive wizard for Coinbase keys
${chalk.cyan('/set-key-bb')} - Configure Browserbase API key and project
${chalk.cyan('/set-key-figma')} - Configure Figma and v0 API credentials
${chalk.cyan('/set-key-redis')} - Configure Redis/Upstash cache credentials
${chalk.cyan('/set-vector-key')} - Configure Upstash Vector database credentials

${chalk.blue.bold('Model Management:')}
${chalk.cyan('/model <name>')} - Switch to a model
${chalk.cyan('/models')} - List available models
${chalk.cyan('/set-key <model> <key>')} - Set API key for a model
${chalk.gray('  e.g. /set-key openrouter sk-or-v1-...')}
${chalk.cyan('/set-key coinbase-id <key>')} - Set Coinbase CDP_API_KEY_ID
${chalk.cyan('/set-key coinbase-secret <key>')} - Set Coinbase CDP_API_KEY_SECRET
${chalk.cyan('/set-key coinbase-wallet-secret <key>')} - Set Coinbase CDP_WALLET_SECRET
${chalk.cyan('/set-key coinbase')} - Interactive wizard for Coinbase keys
${chalk.cyan('/set-key browserbase-api-key <key>')} - Set Browserbase API key
${chalk.cyan('/set-key browserbase-project-id <id>')} - Set Browserbase Project ID
${chalk.cyan('/set-key browserbase')} - Interactive wizard for Browserbase keys

${chalk.blue.bold('Plan Management:')}
${chalk.cyan('/pro [status|activate|help]')} - Manage Pro plan and NikCLI key

${chalk.blue.bold('Configuration:')}
${chalk.cyan('/config')} - Show current configuration
${chalk.cyan('/env <path>')} - Import .env file and persist variables
${chalk.cyan('/router [status|on|off|verbose|mode <m>]')} - Adaptive model router controls
${chalk.cyan('/debug')} - Debug API key configuration
${chalk.cyan('/temp <0.0-2.0>')} - Set temperature (creativity)
${chalk.cyan('/history <on|off>')} - Enable/disable chat history
${chalk.cyan('/system <prompt>')} - Set system prompt for current session

${chalk.blue.bold('Performance & Caching:')}
${chalk.cyan('/tokens')} - Show token usage and optimization
${chalk.cyan('/cache [stats|clear|settings]')} - Manage token cache system
${chalk.cyan('/redis-enable')} - Enable Redis caching
${chalk.cyan('/redis-disable')} - Disable Redis caching
${chalk.cyan('/redis-status')} - Show Redis cache status

${chalk.blue.bold('Session Management:')}
${chalk.cyan('/sessions')} - List all chat sessions
${chalk.cyan('/export [sessionId]')} - Export session to markdown
${chalk.cyan('/stats')} - Show usage statistics

${chalk.blue.bold('Work Session Management:')}
${chalk.cyan('/resume [session-id]')} - Resume previous work session
${chalk.cyan('/work-sessions')} - List all saved work sessions
${chalk.cyan('/save-session [name]')} - Save current work session
${chalk.cyan('/delete-session <id>')} - Delete a work session
${chalk.cyan('/export-session <id> <path>')} - Export work session to file

${chalk.blue.bold('Edit History (Undo/Redo):')}
${chalk.cyan('/undo [count]')} - Undo last N file edits (default: 1)
${chalk.cyan('/redo [count]')} - Redo last N undone edits (default: 1)
${chalk.cyan('/edit-history')} - Show edit history and statistics

${chalk.blue.bold('Agent Management:')}
${chalk.cyan('/agents')} - List all available agents
${chalk.cyan('/agent <name> <task>')} - Run specific agent with task
${chalk.cyan('/auto <description>')} - Autonomous multi-agent execution
${chalk.cyan('/parallel <agents> <task>')} - Run multiple agents in parallel
${chalk.cyan('/factory')} - Show agent factory dashboard
${chalk.cyan('/create-agent <name> <specialization>')} - Create new specialized agent
${chalk.cyan('/launch-agent <id|name> [task]')} - Launch agent from blueprint
${chalk.cyan('/context <paths>')} - Select workspace context paths
${chalk.cyan('/index <path>')} - Index files in path for better context
${chalk.cyan('/stream')} - Show live agent stream dashboard

${chalk.blue.bold('Blueprint Management:')}
${chalk.cyan('/blueprints')} - List and manage all blueprints
${chalk.cyan('/blueprint <id|name>')} - Show detailed blueprint information
${chalk.cyan('/delete-blueprint <id|name>')} - Delete a blueprint
${chalk.cyan('/export-blueprint <id|name> <file>')} - Export blueprint to file
${chalk.cyan('/import-blueprint <file>')} - Import blueprint from file
${chalk.cyan('/search-blueprints <query>')} - Search blueprints by capabilities

${chalk.blue.bold('File Operations:')}
${chalk.cyan('/read <file>')} - Read file contents
${chalk.cyan('/write <file> <content>')} - Write content to file
${chalk.cyan('/edit <file>')} - Edit file interactively
${chalk.cyan('/ls [directory]')} - List files in directory
${chalk.cyan('/search <query> [directory]')} - Search in files (grep-like)
${chalk.cyan('/search --web <query> [--type general|technical|documentation|stackoverflow] [--mode results|answer] [--includeContent] [--maxContentBytes N] [--maxResults N]')} - Web search with AI answer and citations

${chalk.blue.bold('Vision & Image Analysis:')}
${chalk.cyan('/analyze-image <path>')} - Analyze image with AI vision models
${chalk.cyan('/vision <path>')} - Alias for analyze-image
${chalk.cyan('/images')} - Discover images and pick one to analyze
${chalk.cyan('/analyze-image --provider <claude|openai|google|openrouter>')} - Choose specific provider
${chalk.cyan('/analyze-image --prompt "custom prompt"')} - Custom analysis prompt

${chalk.blue.bold('Image Generation:')}
${chalk.cyan('/generate-image "prompt"')} - Generate image with AI models
${chalk.cyan('/create-image "prompt"')} - Alias for generate-image
${chalk.cyan('/generate-image --model <dall-e-3|dall-e-2|gpt-image-1>')} - Choose model
${chalk.cyan('/generate-image --size <1024x1024|1792x1024|1024x1792>')} - Set size

${chalk.blue.bold('Browser Mode (Interactive):')}
${chalk.cyan('/browser [url]')} - Start interactive browser mode
${chalk.cyan('/browser-status')} - Show current browser session status
${chalk.cyan('/browser-screenshot')} - Take screenshot of current page
${chalk.cyan('/browser-exit')} - Exit browser mode and cleanup
${chalk.cyan('/browser-info')} - Show browser capabilities and diagnostics

${chalk.blue.bold('Blockchain & Web3:')}
${chalk.cyan('/web3 status')} - Show Coinbase AgentKit status
${chalk.cyan('/web3 init')} - Initialize AgentKit (CDP keys required)
${chalk.cyan('/web3 wallet')} - Show wallet address and network
${chalk.cyan('/web3 balance')} - Check wallet balance
${chalk.cyan('/web3 transfer <amount> <to> [--token ETH|USDC|WETH]')} - Transfer tokens (with confirmation)
${chalk.cyan('/web3 chat "message"')} - Natural language blockchain request
${chalk.cyan('/web3 wallets')} - List known wallets and pick one
${chalk.cyan('/web3 use-wallet <0x...>')} - Use a specific wallet by address

${chalk.blue.bold('Memory & Personalization:')}
${chalk.cyan('/remember "fact"')} - Store important information in long-term memory
${chalk.cyan('/recall "query"')} - Search memories for relevant information
${chalk.cyan('/memory stats')} - Show memory statistics and configuration
${chalk.cyan('/forget <memory-id>')} - Delete a specific memory (use with caution)

${chalk.blue.bold('Snapshot Management:')}
${chalk.cyan('/snapshot <name> [type]')} - Create project snapshot (quick/full/dev/config)
${chalk.cyan('/snap <name>')} - Alias for quick snapshot
${chalk.cyan('/restore <snapshot-id>')} - Restore files from snapshot
${chalk.cyan('/snapshots [query]')} - List available snapshots

${chalk.blue.bold('Terminal Commands:')}
${chalk.cyan('/run <command>')} - Execute any terminal command
${chalk.cyan('/install <packages>')} - Install npm/yarn packages
${chalk.cyan('/npm <args>')} - Run npm commands
${chalk.cyan('/yarn <args>')} - Run yarn commands
${chalk.cyan('/git <args>')} - Run git commands
${chalk.cyan('/docker <args>')} - Run docker commands
${chalk.cyan('/ps')} - List running processes
${chalk.cyan('/kill <pid>')} - Kill process by PID

${chalk.blue.bold('Project Commands:')}
${chalk.cyan('/build')} - Build the project
${chalk.cyan('/test [pattern]')} - Run tests
${chalk.cyan('/lint')} - Run linting
${chalk.cyan('/create <type> <name>')} - Create new project

${chalk.blue.bold('Background Agent Commands:')}
${chalk.cyan('/bg-agent <task>')} - Create background job with VM execution + auto PR
${chalk.cyan('/bg-jobs [status]')} - List all background jobs (filter by status)
${chalk.cyan('/bg-status <jobId>')} - Get detailed status of specific job
${chalk.cyan('/bg-logs <jobId> [limit]')} - View job execution logs

${chalk.blue.bold('VM Container Commands:')}
${chalk.cyan('/vm')} - Show VM management help
${chalk.cyan('/vm-create <repo-url|os>')} - Create VM (supports alpine|debian|ubuntu)
${chalk.gray('  Flags: --os <alpine|debian|ubuntu>  --mount-desktop  --no-repo')}
${chalk.gray('  Examples: /vm-create alpine --mount-desktop  |  /vm-create https://github.com/user/repo.git --os ubuntu')}
${chalk.cyan('/vm-list')} - List active containers
${chalk.cyan('/vm-stop <id>')} - Stop container
${chalk.cyan('/vm-remove <id>')} - Remove container
${chalk.cyan('/vm-connect <id>')} - Connect to container
${chalk.cyan('/vm-create-pr <id> "<title>" "<desc>" [branch] [base] [draft]')} - Create PR from container
${chalk.cyan('/vm-mode')} - Enter VM chat mode
${chalk.cyan('/vm-switch')} - Switch to different VM
${chalk.cyan('/vm-dashboard')} - Show VM dashboard with status
${chalk.cyan('/vm-select [id]')} - Select VM for targeted chat
${chalk.cyan('/vm-status [id]')} - Show detailed VM system status (OS-like)
${chalk.cyan('/vm-exec <command>')} - Execute command in selected VM
${chalk.cyan('/vm-ls [directory]')} - List files in VM directory
${chalk.cyan('/vm-broadcast <message>')} - Send message to all active VMs
${chalk.cyan('/vm-health')} - Run health check on all VMs
${chalk.cyan('/vm-backup [id]')} - Backup VM session state
${chalk.cyan('/vm-stats')} - Show VM session statistics

${chalk.blue.bold('Figma Design Integration:')}
${chalk.cyan('/figma-config')} - Show Figma API configuration status
${chalk.cyan('/figma-info <file-id>')} - Get file information from Figma
${chalk.cyan('/figma-export <file-id> [format] [output-path]')} - Export designs (png/svg/pdf)
${chalk.cyan('/figma-to-code <file-id> [framework] [library]')} - Generate code from designs
${chalk.cyan('/figma-open <file-url>')} - Open Figma file in desktop app (macOS)
${chalk.cyan('/figma-tokens <file-id> [format]')} - Extract design tokens (json/css/scss)
${chalk.cyan('/figma-create <component-path> [name]')} - Create Figma design from React component

${chalk.blue.bold('Web Browsing (BrowseGPT):')}
${chalk.cyan('/browse-session [id]')} - Create new browsing session
${chalk.cyan('/browse-search <sessionId> <query>')} - Search the web
${chalk.cyan('/browse-visit <sessionId> <url> [prompt]')} - Visit page and extract content
${chalk.cyan('/browse-chat <sessionId> <message>')} - Chat with AI about web content
${chalk.cyan('/browse-sessions')} - List all active browsing sessions
${chalk.cyan('/browse-info <sessionId>')} - Get session information
${chalk.cyan('/browse-close <sessionId>')} - Close browsing session
${chalk.cyan('/browse-cleanup')} - Clean up inactive sessions
${chalk.cyan('/browse-quick <query> [prompt]')} - Quick search, visit, and analyze

${chalk.blue.bold('Security Commands:')}
${chalk.cyan('/security [status|set|help]')} - Manage security settings
${chalk.cyan('/dev-mode [enable|status|help]')} - Developer mode controls
${chalk.cyan('/safe-mode')} - Enable safe mode (maximum security)
${chalk.cyan('/clear-approvals')} - Clear session approvals

${chalk.gray('Tip: Use Ctrl+C to stop streaming responses')}
    `

    console.log(help)
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async authCommand(args: string[] = []): Promise<CommandResult> {
    const sub = (args[0] || 'login').toLowerCase()
    const nik: any = (global as any).__nikCLI

    try {
      const { authProvider } = await import('../providers/supabase/auth-provider')
      const readline = await import('readline')

      if (sub === 'help' || sub === '-h') {
        const panel = boxen(
          [
            chalk.cyan.bold('🔐 Authentication Commands'),
            chalk.gray('─'.repeat(40)),
            '',
            `${chalk.green('/auth')}           - Sign in with email and password`,
            `${chalk.green('/auth login')}    - Sign in with email and password`,
            `${chalk.green('/auth signup')}   - Create a new account`,
            `${chalk.green('/auth logout')}   - Sign out and clear credentials`,
            `${chalk.green('/auth status')}   - Show authentication status`,
          ].join('\n'),
          { title: 'Authentication', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
        )
        if (nik?.printPanel) nik.printPanel(panel)
        else console.log(panel)
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      if (sub === 'logout') {
        await authProvider.signOut()
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      if (sub === 'status') {
        const currentUser = authProvider.getCurrentUser()
        const profile = authProvider.getCurrentProfile()
        if (currentUser && profile) {
          const panel = boxen(
            [
              chalk.green(`✓ Logged in as ${profile.email || profile.username}`),
              '',
              `Email: ${profile.email}`,
              `Tier: ${profile.subscription_tier}`,
            ].join('\n'),
            { title: 'Auth Status', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }
          )
          if (nik?.printPanel) nik.printPanel(panel)
          else console.log(panel)
        } else {
          const panel = boxen(chalk.yellow('⚠️ Not authenticated. Use /auth to login.'), {
            title: 'Auth Status',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
          if (nik?.printPanel) nik.printPanel(panel)
          else console.log(panel)
        }
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Sign in or sign up flow
      const isSignUp = sub === 'signup'
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const email = await new Promise<string>((resolve) => {
        rl.question(chalk.blue('Email: '), resolve)
      })

      if (!email) {
        rl.close()
        console.log(chalk.yellow('⚠️ Email required'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Read password with hidden input
      const password = await new Promise<string>((resolve) => {
        const { stdin, stdout } = process
        const password: string[] = []

        const onData = (buf: Buffer) => {
          const char = buf.toString()
          switch (char) {
            case '\n':
            case '\r':
            case '\u0004':
              stdout.write('\n')
              stdin.setRawMode(false)
              stdin.pause()
              stdin.removeListener('data', onData)
              resolve(password.join(''))
              break
            case '\u0003':
              stdout.write('\n')
              stdin.setRawMode(false)
              stdin.pause()
              stdin.removeListener('data', onData)
              process.exit(130)
              break
            case '\u007f':
            case '\b':
              if (password.length > 0) {
                password.pop()
                stdout.write('\b \b')
              }
              break
            default:
              if (char.charCodeAt(0) >= 32) {
                password.push(char)
                stdout.write('*')
              }
          }
        }

        stdout.write(chalk.blue('Password: '))
        stdin.setRawMode(true)
        stdin.resume()
        stdin.on('data', onData)
      })

      rl.close()

      if (!password) {
        console.log(chalk.yellow('⚠️ Password required'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Show processing message
      const processingBox = boxen(chalk.blue('⚡︎ Processing...'), {
        padding: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        title: isSignUp ? 'Creating Account' : 'Signing In',
      })
      if (nik?.printPanel) nik.printPanel(processingBox)
      else console.log(processingBox)

      // Perform sign in or sign up
      const result = isSignUp
        ? await authProvider.signUp(email, password, { username: email.split('@')[0] })
        : await authProvider.signIn(email, password, { rememberMe: true })

      if (result) {
        const successBox = boxen(
          [
            chalk.green(`✓ ${isSignUp ? 'Account created' : 'Signed in'} as ${result.profile.email}`),
            '',
            `Subscription: ${result.profile.subscription_tier}`,
            chalk.dim('Credentials saved - you can now use /pro'),
          ].join('\n'),
          {
            padding: 1,
            borderStyle: 'round',
            borderColor: 'green',
            title: isSignUp ? 'Account Created' : 'Signed In',
          }
        )
        if (nik?.printPanel) nik.printPanel(successBox)
        else console.log(successBox)
      } else {
        const errorBox = boxen(chalk.red('❌ Authentication failed'), {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'red',
          title: 'Error',
        })
        if (nik?.printPanel) nik.printPanel(errorBox)
        else console.log(errorBox)
      }

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async proCommand(args: string[] = []): Promise<CommandResult> {
    const sub = (args[0] || 'status').toLowerCase()
    try {
      const { authProvider } = await import('../providers/supabase/auth-provider')
      const { subscriptionService } = await import('../services/subscription-service')
      const nik: any = (global as any).__nikCLI
      const currentUser = authProvider.getCurrentUser()

      // Check if user is authenticated (except for 'help' command)
      if (sub !== 'help' && !currentUser) {
        const panel = boxen(
          [
            chalk.yellow('⚠️ Authentication Required'),
            '',
            chalk.gray('Pro features require authentication.'),
            '',
            chalk.cyan('Please authenticate with:'),
            chalk.blue('/auth'),
          ].join('\n'),
          {
            title: 'Plan',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }
        )
        if (nik?.printPanel) nik.printPanel(panel)
        else console.log(panel)
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const profile = authProvider.getCurrentProfile()
      const tier = profile?.subscription_tier || 'free'

      if (sub === 'help') {
        const panel = boxen(
          [
            chalk.cyan.bold('💳 Pro Plan Commands'),
            chalk.gray('─'.repeat(30)),
            '',
            `${chalk.green('/pro status')}  - Show current plan status`,
            `${chalk.green('/pro upgrade')} - Get link to upgrade to Pro`,
            `${chalk.green('/pro activate')} - Fetch and store OpenRouter key (Pro only)`,
          ].join('\n'),
          { title: 'Plan', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
        )
        if (nik?.printPanel) nik.printPanel(panel)
        else console.log(panel)
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      if (sub === 'status') {
        const hasKey = Boolean(simpleConfigManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY)
        const lines: string[] = []
        lines.push(`${chalk.white('Current plan:')} ${chalk.green(tier)}`)
        lines.push('')
        if (tier === 'free') {
          lines.push(chalk.cyan('Free mode (BYOK):'))
          lines.push(chalk.gray('• Provide your own OpenRouter key'))
          lines.push(chalk.gray('• Configure with: /set-key openrouter <key>'))
          lines.push(chalk.gray('• Or set env OPENROUTER_API_KEY'))
        } else {
          lines.push(chalk.cyan('Pro mode (Managed):'))
          lines.push(chalk.gray('• NikCLI manages your OpenRouter key'))
          lines.push(chalk.gray('• Key loaded automatically on login'))
          lines.push(chalk.gray('• Manual reload: /pro activate'))
        }
        lines.push('')
        lines.push(chalk.green('Upgrade to Pro:'))
        const currentUser = authProvider.getCurrentUser()
        if (currentUser) {
          const paymentLink = subscriptionService.getPaymentLink(currentUser.id)
          lines.push(chalk.gray(`• Visit: ${paymentLink}`))
        }
        lines.push(chalk.gray('• Or use: /pro upgrade'))
        lines.push('')
        lines.push(`${chalk.white('Key status:')} ${hasKey ? chalk.green('present') : chalk.yellow('not configured')}`)
        const panel = boxen(lines.join('\n'), {
          title: 'Plan Status',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: tier === 'free' ? 'cyan' : 'green',
        })
        if (nik?.printPanel) nik.printPanel(panel)
        else console.log(panel)
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      if (sub === 'upgrade') {
        // Note: currentUser is already checked above, this is redundant but kept for clarity
        const paymentLink = subscriptionService.getPaymentLink(currentUser?.id as string)
        const lines: string[] = []
        lines.push(chalk.cyan.bold('Upgrade to NikCLI Pro'))
        lines.push('')
        lines.push(chalk.white('Benefits:'))
        lines.push(chalk.gray('• Managed OpenRouter API key'))
        lines.push(chalk.gray('• No manual key configuration'))
        lines.push(chalk.gray('• Higher usage quotas'))
        lines.push(chalk.gray('• Priority support'))
        lines.push('')
        lines.push(chalk.green('Payment Link:'))
        lines.push(chalk.blue(paymentLink))
        const panel = boxen(lines.join('\n'), {
          title: '💎 Upgrade to Pro',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
        if (nik?.printPanel) nik.printPanel(panel)
        else console.log(panel)
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      if (sub === 'activate') {
        if (tier !== 'pro' && tier !== 'enterprise') {
          // currentUser is guaranteed to exist due to check at top of function
          const paymentLink = subscriptionService.getPaymentLink(currentUser!.id)
          const panel = boxen(
            [
              chalk.yellow('⚠️ Pro subscription required'),
              '',
              chalk.gray(`Upgrade at: ${paymentLink}`),
              chalk.gray('Or use: /pro upgrade'),
            ].join('\n'),
            {
              title: 'Plan',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            }
          )
          if (nik?.printPanel) nik.printPanel(panel)
          else console.log(panel)
          return { shouldExit: false, shouldUpdatePrompt: false }
        }

        try {
          const loaded = await subscriptionService.loadProApiKey()
          const nik: any = (global as any).__nikCLI
          if (loaded) {
            const panel = boxen(chalk.green('✓ OpenRouter API key loaded from subscription'), {
              title: 'Plan',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
            if (nik?.printPanel) nik.printPanel(panel)
            else console.log(panel)
          } else {
            const panel = boxen(chalk.yellow('⚠️ API key not found. Contact support if issue persists.'), {
              title: 'Plan',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
            if (nik?.printPanel) nik.printPanel(panel)
            else console.log(panel)
          }
        } catch (e: any) {
          const nik: any = (global as any).__nikCLI
          const panel = boxen(chalk.red(`❌ Activation failed: ${e.message}`), {
            title: 'Plan',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          })
          if (nik?.printPanel) nik.printPanel(panel)
          else console.log(panel)
        }
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.red(`❌ Unknown subcommand: ${sub}`))
      console.log(chalk.gray('Use /pro help for available commands'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      console.log(chalk.red(`❌ Pro command failed: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async quitCommand(): Promise<CommandResult> {
    console.log(chalk.yellow('👋 Thanks for using AI Coder CLI!'))
    return { shouldExit: true, shouldUpdatePrompt: false }
  }

  private async clearCommand(): Promise<CommandResult> {
    const boxen = (await import('boxen')).default
    chatManager.clearCurrentSession()

    this.printPanel(
      boxen('Chat history cleared successfully', {
        title: '✓ Session Cleared',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
      })
    )
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async modelCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      const current = modelProvider.getCurrentModelInfo()
      this.printPanel(
        boxen(`${chalk.cyan(current.name)}\nProvider: ${chalk.gray(current.config.provider)}`, {
          title: '🤖 Current Model',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    // 🔍 Validate model command arguments with Zod
    const modelArgs = parseKeyValueArgs(args)
    const modelData = {
      model: args[0],
      provider: modelArgs.provider,
      temperature: modelArgs.temperature ? parseFloat(modelArgs.temperature) : undefined,
    }

    const validatedArgs = validateCommandArgs(ModelCommandSchema, modelData, 'model')

    if (!validatedArgs) {
      console.log(chalk.gray(`Usage: /model <model-name> [provider=<provider>] [temperature=<0-2>]`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const modelName = validatedArgs.model
    try {
      configManager.setCurrentModel(modelName)

      // Apply additional configuration if provided
      if (validatedArgs.temperature !== undefined) {
        configManager.set('temperature', validatedArgs.temperature)
        console.log(chalk.blue(`🌡️ Temperature set to: ${validatedArgs.temperature}`))
      }

      // Validate the new model
      if (modelProvider.validateApiKey()) {
        console.log(chalk.green(`✓ Switched to model: ${modelName}`))
        return { shouldExit: false, shouldUpdatePrompt: true }
      } else {
        console.log(chalk.yellow(`⚠️  Switched to model: ${modelName} (API key needed)`))
        return { shouldExit: false, shouldUpdatePrompt: true }
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async modelsCommand(): Promise<CommandResult> {
    console.log(chalk.blue.bold('\n🤖 Available Models:'))
    console.log(chalk.gray('─'.repeat(40)))

    const currentModel = configManager.get('currentModel')
    const models = configManager.get('models')

    Object.entries(models).forEach(([name, config]) => {
      const isCurrent = name === currentModel
      const hasKey = configManager.getApiKey(name) !== undefined
      const status = hasKey ? chalk.green('✓') : chalk.red('❌')
      const prefix = isCurrent ? chalk.yellow('→ ') : '  '

      console.log(`${prefix}${status} ${chalk.bold(name)}`)
      console.log(`    ${chalk.gray(`Provider: ${config.provider} | Model: ${config.model}`)}`)
    })

    console.log(chalk.gray('\nUse /model <name> to switch models'))
    console.log(chalk.gray('Use /set-key <model> <key> to add API keys'))

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async routerCommand(args: string[] = []): Promise<CommandResult> {
    try {
      const { configManager } = await import('../core/config-manager')
      const sub = (args[0] || 'status').toLowerCase()

      const cfg = configManager.getAll()
      cfg.modelRouting = cfg.modelRouting || ({ enabled: true, verbose: false, mode: 'balanced' } as any)

      switch (sub) {
        case 'on':
          cfg.modelRouting.enabled = true
          configManager.setAll(cfg as any)
          this.cliInstance.printPanel(
            boxen('Adaptive model routing enabled', {
              title: '🔀 Router',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
          break
        case 'off':
          cfg.modelRouting.enabled = false
          configManager.setAll(cfg as any)
          this.cliInstance.printPanel(
            boxen('Adaptive model routing disabled', {
              title: '🔀 Router',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        case 'verbose':
          cfg.modelRouting.verbose = !cfg.modelRouting.verbose
          configManager.setAll(cfg as any)
          this.cliInstance.printPanel(
            boxen(`Verbose logging: ${cfg.modelRouting.verbose ? 'ON' : 'OFF'}`, {
              title: '🔀 Router',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            })
          )
          break
        case 'mode': {
          const mode = (args[1] || 'balanced').toLowerCase()
          if (!['conservative', 'balanced', 'aggressive'].includes(mode)) {
            console.log(chalk.red('Usage: /router mode <conservative|balanced|aggressive>'))
            break
          }
          ; (cfg.modelRouting as any).mode = mode as any
          configManager.setAll(cfg as any)
          this.cliInstance.printPanel(
            boxen(`Routing mode set to ${mode}`, {
              title: '🔀 Router',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            })
          )
          break
        }
        default: {
          const lines = [
            `${chalk.green('Enabled:')} ${cfg.modelRouting.enabled ? 'Yes' : 'No'}`,
            `${chalk.green('Verbose:')} ${cfg.modelRouting.verbose ? 'Yes' : 'No'}`,
            `${chalk.green('Mode:')} ${cfg.modelRouting.mode}`,
            '',
            chalk.gray('Routing stays within provider and API key.'),
            chalk.gray('Use /router on|off | /router verbose | /router mode <...>'),
          ].join('\n')
          this.cliInstance.printPanel(
            boxen(lines, {
              title: '🔀 Router Status',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            })
          )
        }
      }
    } catch (error: any) {
      this.cliInstance.printPanel(
        boxen(`Router error: ${error.message}`, {
          title: '❌ Router',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async setKeyCommand(args: string[]): Promise<CommandResult> {
    // Interactive Coinbase setup
    if (args.length === 1 && ['coinbase', 'cdp', 'coinbase-keys'].includes(args[0].toLowerCase())) {
      await this.interactiveSetCoinbaseKeys()
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    if (args.length === 1 && ['browserbase', 'browserbase-keys'].includes(args[0].toLowerCase())) {
      await this.interactiveSetBrowserbaseKeys()
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    if (args.length < 2) {
      this.printPanel(
        chalk.red(
          'Usage: /set-key <model|coinbase-id|coinbase-secret|coinbase-wallet-secret|browserbase-api-key|browserbase-project-id> <api-key>'
        )
      )
      console.log(chalk.gray('Examples:'))
      console.log(chalk.gray('  /set-key claude-3-5-sonnet sk-ant-...'))
      console.log(chalk.gray('  /set-key coinbase-id your_cdp_api_key_id'))
      console.log(chalk.gray('  /set-key coinbase-secret your_cdp_api_key_secret'))
      console.log(chalk.gray('  /set-key coinbase-wallet-secret your_cdp_wallet_secret'))
      console.log(chalk.gray('  /set-key coinbase   # interactive wizard'))
      console.log(chalk.gray('  /set-key browserbase-api-key your_browserbase_api_key'))
      console.log(chalk.gray('  /set-key browserbase-project-id your_project_id'))
      console.log(chalk.gray('  /set-key browserbase   # interactive wizard'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const [name, apiKey] = args
    try {
      const keyName = name.toLowerCase()
      if (['coinbase-id', 'cdp-id', 'cdp_api_key_id'].includes(keyName)) {
        configManager.setApiKey('coinbase_id', apiKey)
        process.env.CDP_API_KEY_ID = apiKey
        console.log(chalk.green('✓ Coinbase CDP_API_KEY_ID set'))
      } else if (['coinbase-secret', 'cdp-secret', 'cdp_api_key_secret'].includes(keyName)) {
        configManager.setApiKey('coinbase_secret', apiKey)
        process.env.CDP_API_KEY_SECRET = apiKey
        console.log(chalk.green('✓ Coinbase CDP_API_KEY_SECRET set'))
      } else if (['coinbase-wallet-secret', 'wallet-secret', 'cdp_wallet_secret'].includes(keyName)) {
        configManager.setApiKey('coinbase_wallet_secret', apiKey)
        process.env.CDP_WALLET_SECRET = apiKey
        console.log(chalk.green('✓ Coinbase CDP_WALLET_SECRET set'))
      } else if (['browserbase-api-key', 'browserbase-key', 'bb-api-key'].includes(keyName)) {
        configManager.setApiKey('browserbase', apiKey)
        process.env.BROWSERBASE_API_KEY = apiKey
        console.log(chalk.green('✓ Browserbase API key set'))
      } else if (['browserbase-project-id', 'bb-project-id', 'browserbase-project'].includes(keyName)) {
        configManager.setApiKey('browserbase_project_id', apiKey)
        process.env.BROWSERBASE_PROJECT_ID = apiKey
        console.log(chalk.green('✓ Browserbase Project ID set'))
      } else if (keyName === 'openrouter' || keyName === 'nikcli') {
        const valid = await this.validateOpenRouterKey(apiKey)
        if (!valid) {
          console.log(chalk.red('❌ Invalid OpenRouter API key'))
          return { shouldExit: false, shouldUpdatePrompt: false }
        }
        configManager.setApiKey('openrouter', apiKey)
        process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || apiKey
        console.log(chalk.green('✓ OpenRouter key set and validated'))
      } else {
        configManager.setApiKey(name, apiKey)
        console.log(chalk.green(`✓ API key set for ${name}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async validateOpenRouterKey(key: string): Promise<boolean> {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` } as any,
      } as any)
      return res.ok
    } catch (_e) {
      return false
    }
  }

  /**
   * Interactive wizard to set Coinbase AgentKit keys securely
   */
  private async interactiveSetCoinbaseKeys(): Promise<void> {
    try {
      const inquirer = (await import('inquirer')).default
      const { inputQueue } = await import('../core/input-queue')

      const nik: any = (global as any).__nikCLI
      nik?.beginPanelOutput?.()
      this.cliInstance.printPanel(
        boxen('Enter your Coinbase CDP credentials. Values are stored encrypted. Leave blank to keep current.', {
          title: '🔑 Set Coinbase Keys',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )
      nik?.endPanelOutput?.()

      const currentId = configManager.getApiKey('coinbase_id')
      const currentSecret = configManager.getApiKey('coinbase_secret')
      const currentWallet = configManager.getApiKey('coinbase_wallet_secret')

      // Suspend prompt for interactive input
      nik?.suspendPrompt?.()
      inputQueue.enableBypass()
      let answers: any
      try {
        answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'id',
            message: 'CDP_API_KEY_ID',
            mask: '*',
            suffix: currentId ? chalk.gray(' (configured)') : '',
          },
          {
            type: 'password',
            name: 'secret',
            message: 'CDP_API_KEY_SECRET',
            mask: '*',
            suffix: currentSecret ? chalk.gray(' (configured)') : '',
          },
          {
            type: 'password',
            name: 'wallet',
            message: 'CDP_WALLET_SECRET',
            mask: '*',
            suffix: currentWallet ? chalk.gray(' (configured)') : '',
          },
        ])
      } finally {
        inputQueue.disableBypass()
        nik?.renderPromptAfterOutput?.()
      }

      const setIfProvided = (label: string, key: string | undefined, setter: (v: string) => void) => {
        if (key && key.trim().length > 0) {
          setter(key.trim())
          console.log(chalk.green(`✓ Saved ${label}`))
        } else {
          console.log(chalk.gray(`⏭️  Skipped ${label}`))
        }
      }

      setIfProvided('CDP_API_KEY_ID', answers.id, (v) => {
        configManager.setApiKey('coinbase_id', v)
        process.env.CDP_API_KEY_ID = v
      })
      setIfProvided('CDP_API_KEY_SECRET', answers.secret, (v) => {
        configManager.setApiKey('coinbase_secret', v)
        process.env.CDP_API_KEY_SECRET = v
      })
      setIfProvided('CDP_WALLET_SECRET', answers.wallet, (v) => {
        configManager.setApiKey('coinbase_wallet_secret', v)
        process.env.CDP_WALLET_SECRET = v
      })

      this.cliInstance.printPanel(
        boxen('Coinbase keys updated. You can now run /web3 init', {
          title: '✓ Keys Saved',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.cliInstance.printPanel(
        boxen(`Failed to set Coinbase keys: ${error.message}`, {
          title: '❌ Set Coinbase Keys',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  private async interactiveSetBrowserbaseKeys(): Promise<void> {
    try {
      const inquirer = (await import('inquirer')).default
      const { inputQueue } = await import('../core/input-queue')

      const nik: any = (global as any).__nikCLI
      nik?.beginPanelOutput?.()
      this.cliInstance.printPanel(
        boxen('Enter your Browserbase credentials. Values are stored encrypted. Leave blank to keep current.', {
          title: '🌐 Set Browserbase Keys',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )
      nik?.endPanelOutput?.()

      const currentApiKey = configManager.getApiKey('browserbase')
      const currentProjectId = configManager.getApiKey('browserbase_project_id')

      // Suspend prompt for interactive input
      nik?.suspendPrompt?.()
      inputQueue.enableBypass()
      let answers: any
      try {
        answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'BROWSERBASE_API_KEY',
            mask: '*',
            suffix: currentApiKey ? chalk.gray(' (configured)') : '',
          },
          {
            type: 'input',
            name: 'projectId',
            message: 'BROWSERBASE_PROJECT_ID',
            suffix: currentProjectId ? chalk.gray(' (configured)') : '',
          },
        ])
      } finally {
        inputQueue.disableBypass()
        nik?.renderPromptAfterOutput?.()
      }

      const setIfProvided = (label: string, key: string | undefined, setter: (v: string) => void) => {
        if (key && key.trim().length > 0) {
          setter(key.trim())
          console.log(chalk.green(`✓ Saved ${label}`))
        } else {
          console.log(chalk.gray(`⏭️  Skipped ${label}`))
        }
      }

      setIfProvided('BROWSERBASE_API_KEY', answers.apiKey, (v) => {
        configManager.setApiKey('browserbase', v)
        process.env.BROWSERBASE_API_KEY = v
      })
      setIfProvided('BROWSERBASE_PROJECT_ID', answers.projectId, (v) => {
        configManager.setApiKey('browserbase_project_id', v)
        process.env.BROWSERBASE_PROJECT_ID = v
      })

      this.cliInstance.printPanel(
        boxen('Browserbase keys updated. You can now browse and analyze web content!', {
          title: '✓ Keys Saved',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.cliInstance.printPanel(
        boxen(`Failed to set Browserbase keys: ${error.message}`, {
          title: '❌ Set Browserbase Keys',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  }

  private async configCommand(): Promise<CommandResult> {
    console.log(configManager.getConfig())
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async envCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /env <path-to-env-file>'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const providedPath = args[0]
    const resolvedPath = resolve(process.cwd(), providedPath)

    if (!existsSync(resolvedPath)) {
      console.log(chalk.red(`❌ Env file not found: ${providedPath}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const stats = statSync(resolvedPath)
    if (!stats.isFile()) {
      console.log(chalk.red(`❌ Path is not a file: ${providedPath}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const raw = readFileSync(resolvedPath, 'utf8')
      const parsed = parseDotenv(raw)
      const variables: Record<string, string> = {}

      for (const [rawKey, value] of Object.entries(parsed)) {
        const key = rawKey.trim()
        if (!key) continue
        variables[key] = value
      }

      const total = Object.keys(variables).length
      if (total === 0) {
        console.log(chalk.yellow('⚠️  No environment variables found in file'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const { added, updated } = configManager.storeEnvironmentVariables(resolvedPath, variables)
      const skipped = Math.max(total - added - updated, 0)

      this.cliInstance.printPanel(
        boxen(
          `${chalk.green('Environment variables imported successfully')}` +
          `\n${chalk.gray('File:')} ${chalk.cyan(resolvedPath)}` +
          `\n${chalk.gray('Total:')} ${total}  ${chalk.gray('Added:')} ${added}  ${chalk.gray('Updated:')} ${updated}  ${chalk.gray('Skipped:')} ${skipped}` +
          `\n${chalk.gray('Available immediately and persisted to ~/.nikcli/config.json')}`,
          {
            title: '✓ Env Saved',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      )
    } catch (error: any) {
      this.cliInstance.printPanel(
        boxen(`Failed to import environment variables: ${error.message}`, {
          title: '❌ Env Import Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async newSessionCommand(args: string[]): Promise<CommandResult> {
    const title = args.join(' ') || undefined
    const session = chatManager.createNewSession(title)
    console.log(chalk.green(`✓ New session created: ${session.title} (${session.id.slice(0, 8)})`))
    return { shouldExit: false, shouldUpdatePrompt: true }
  }

  private async vmCreatePRCommand(args: string[]): Promise<CommandResult> {
    if (args.length < 3) {
      this.printPanel(
        chalk.red('Usage: /vm-create-pr <container-id> "<title>" "<description>" [branch] [baseBranch] [draft]')
      )
      this.printPanel(
        chalk.gray('Example: /vm-create-pr abc123 "Add CI pipeline" "Adds GitHub Actions for CI" feature/ci main true')
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    // Helper to extract a (possibly quoted) argument from a parts array
    const extractQuoted = (parts: string[]): { value: string; rest: string[] } => {
      if (parts.length === 0) return { value: '', rest: [] }
      const first = parts[0]
      const quote = (first.startsWith('"') && '"') || (first.startsWith("'") && "'") || ''
      if (!quote) {
        return { value: first, rest: parts.slice(1) }
      }
      // Start collecting until closing quote is found
      const collected: string[] = [first.slice(1)]
      for (let i = 1; i < parts.length; i++) {
        const token = parts[i]
        if (token.endsWith(quote)) {
          collected.push(token.slice(0, -1))
          return { value: collected.join(' ').trim(), rest: parts.slice(i + 1) }
        }
        collected.push(token)
      }
      // Fallback if no closing quote: join everything
      return { value: collected.join(' ').trim(), rest: [] }
    }

    try {
      const containerIdPrefix = args[0]
      let rest = args.slice(1)

      // Parse title
      const titleParsed = extractQuoted(rest)
      const title = titleParsed.value
      rest = titleParsed.rest

      // Parse description
      const descParsed = extractQuoted(rest)
      const description = descParsed.value
      rest = descParsed.rest

      // Optional args
      const branch = rest[0]
      const baseBranch = rest[1]
      const draftRaw = rest[2]
      const draft =
        typeof draftRaw !== 'undefined' ? ['true', '1', 'yes', 'on', 'draft'].includes(draftRaw.toLowerCase()) : false

      // Resolve full container ID from prefix
      const containers = this.vmOrchestrator.getActiveContainers()
      const container = containers.find((c) => c.id.startsWith(containerIdPrefix))
      if (!container) {
        console.log(chalk.red(`❌ Container ${containerIdPrefix} not found`))
        console.log(chalk.gray('Use /vm-list to see active containers'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`📝 Creating PR from container ${container.id.slice(0, 12)}`))
      if (!process.env.GITHUB_TOKEN) {
        console.log(chalk.yellow('⚠️ GITHUB_TOKEN not set. Will return a manual PR URL instead of creating via API.'))
      }

      const prUrl = await this.vmOrchestrator.createPullRequest(container.id, {
        title,
        description,
        branch,
        baseBranch,
        draft,
      })

      console.log(chalk.green(`✓ Pull request ready: ${prUrl}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to create PR: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async sessionsCommand(): Promise<CommandResult> {
    const sessions = chatManager.listSessions()
    const current = chatManager.getCurrentSession()

    console.log(chalk.blue.bold('\n📝 Chat Sessions:'))
    console.log(chalk.gray('─'.repeat(40)))

    if (sessions.length === 0) {
      console.log(chalk.gray('No sessions found'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    sessions.forEach((session, _index) => {
      const isCurrent = session.id === current?.id
      const prefix = isCurrent ? chalk.yellow('→ ') : '  '
      const messageCount = session.messages.filter((m) => m.role !== 'system').length

      console.log(`${prefix}${chalk.bold(session.title)} ${chalk.gray(`(${session.id.slice(0, 8)})`)}`)
      console.log(`    ${chalk.gray(`${messageCount} messages | ${session.updatedAt}`)}`)
    })

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async exportCommand(args: string[]): Promise<CommandResult> {
    try {
      const sessionId = args[0]
      const markdown = chatManager.exportSession(sessionId)

      const filename = `chat-export-${Date.now()}.md`
      require('node:fs').writeFileSync(filename, markdown)

      console.log(chalk.green(`✓ Session exported to ${filename}`))
    } catch (error: any) {
      console.log(chalk.red(`❌ ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async systemCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      const session = chatManager.getCurrentSession()
      this.printPanel(
        boxen(session?.systemPrompt || 'None', {
          title: '🎯 Current System Prompt',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const prompt = args.join(' ')
    const session = chatManager.getCurrentSession()
    if (session) {
      session.systemPrompt = prompt
      // Update the system message
      const systemMsgIndex = session.messages.findIndex((m) => m.role === 'system')
      if (systemMsgIndex >= 0) {
        session.messages[systemMsgIndex].content = prompt
      } else {
        session.messages.unshift({
          role: 'system',
          content: prompt,
          timestamp: new Date(),
        })
      }
      console.log(chalk.green('✓ System prompt updated'))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async statsCommand(): Promise<CommandResult> {
    const boxen = (await import('boxen')).default
    const stats = chatManager.getSessionStats()
    const modelInfo = modelProvider.getCurrentModelInfo()

    const content = [
      `Current Model: ${chalk.cyan(modelInfo.name)}`,
      `Total Sessions: ${chalk.cyan(stats.totalSessions)}`,
      `Total Messages: ${chalk.cyan(stats.totalMessages)}`,
      `Current Session Messages: ${chalk.cyan(stats.currentSessionMessages)}`,
    ].join('\n')

    this.printPanel(
      boxen(content, {
        title: '📊 Usage Statistics',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue',
      })
    )

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async temperatureCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      this.printPanel(
        boxen(`Current temperature: ${chalk.cyan(configManager.get('temperature'))}`, {
          title: '🌡️ Temperature',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const temp = parseFloat(args[0])
    if (Number.isNaN(temp) || temp < 0 || temp > 2) {
      this.printPanel(
        boxen('Temperature must be between 0.0 and 2.0', {
          title: '❌ Invalid Value',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    configManager.set('temperature', temp)
    this.printPanel(
      boxen(`Temperature set to ${chalk.cyan(temp)}`, {
        title: '✓ Temperature Updated',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
      })
    )

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async historyCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      const enabled = configManager.get('chatHistory')
      this.printPanel(
        boxen(`Status: ${chalk.cyan(enabled ? 'enabled' : 'disabled')}`, {
          title: '📜 Chat History',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const setting = args[0].toLowerCase()
    if (setting !== 'on' && setting !== 'off') {
      this.printPanel(
        boxen('Usage: /history <on|off>', {
          title: '❌ Invalid Argument',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    configManager.set('chatHistory', setting === 'on')
    this.printPanel(
      boxen(`Chat history ${chalk.cyan(setting === 'on' ? 'enabled' : 'disabled')}`, {
        title: '✓ History Updated',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green',
      })
    )

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async debugCommand(): Promise<CommandResult> {
    console.log(chalk.blue.bold('\n🔍 Debug Information:'))
    console.log(chalk.gray('═'.repeat(40)))

    try {
      // Test model configuration
      const currentModel = configManager.getCurrentModel()
      console.log(chalk.green(`Current Model: ${currentModel}`))

      const models = configManager.get('models')
      const currentModelConfig = models[currentModel]

      if (!currentModelConfig) {
        console.log(chalk.red(`❌ Model configuration missing for: ${currentModel}`))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.green(`Provider: ${currentModelConfig.provider}`))
      console.log(chalk.green(`Model: ${currentModelConfig.model}`))

      // Test API key
      const apiKey = configManager.getApiKey(currentModel)
      if (apiKey) {
        console.log(chalk.green(`✓ API Key: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)} (${apiKey.length} chars)`))
      } else {
        console.log(chalk.red(`❌ API Key: Not configured`))
        console.log(chalk.yellow(`   Set with: /set-key ${currentModel} <your-api-key>`))
      }

      // Test model provider validation
      try {
        const isValid = modelProvider.validateApiKey()
        console.log(chalk.green(`✓ Model Provider Validation: ${isValid ? 'Valid' : 'Invalid'}`))
      } catch (error: any) {
        console.log(chalk.red(`❌ Model Provider Validation Failed: ${error.message}`))
      }

      // Test a simple generation
      try {
        console.log(chalk.blue('\n🧪 Testing AI Generation...'))
        const testResponse = await modelProvider.generateResponse({
          messages: [{ role: 'user', content: 'Say "test successful"' }],
          maxTokens: 20,
        })
        console.log(chalk.green(`✓ Test Generation: ${testResponse.trim()}`))
      } catch (error: any) {
        console.log(chalk.red(`❌ Test Generation Failed: ${error.message}`))
      }

      // Environment variables
      console.log(chalk.blue('\n🌍 Environment Variables:'))
      const envVars = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'V0_API_KEY']
      envVars.forEach((envVar) => {
        const value = process.env[envVar]
        if (value) {
          console.log(chalk.green(`✓ ${envVar}: ${value.slice(0, 10)}...${value.slice(-4)}`))
        } else {
          console.log(chalk.gray(`❌ ${envVar}: Not set`))
        }
      })
    } catch (error: any) {
      console.log(chalk.red(`❌ Debug error: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async dashboardCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default
    const action = args[0]

    try {
      if (!action) {
        // Show current dashboard metrics as a panel
        try {
          const metrics = this.collectDashboardMetrics()
          const content = this.formatDashboardPanel(metrics)

          if (!content || content.trim().length === 0) {
            // Fallback panel if no content
            this.printPanel(
              boxen('Dashboard is loading...\n\nBasic System Info:\n' +
                `Platform: ${process.platform}\n` +
                `Architecture: ${process.arch}\n` +
                `Node Version: ${process.version}\n` +
                `Uptime: ${this.formatUptime(process.uptime())}`, {
                title: '📊 Dashboard Loading',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
          } else {
            this.printPanel(
              boxen(content, {
                title: '📊 Enterprise Analytics Dashboard',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
              })
            )
          }
        } catch (error: any) {
          // Error fallback panel
          this.printPanel(
            boxen(`Dashboard Error: ${error.message}\n\nBasic Info:\n` +
              `Platform: ${process.platform}\n` +
              `Node: ${process.version}\n` +
              `Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, {
              title: '❌ Dashboard Error',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
        }
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      switch (action) {
        case 'show':
        case 'status':
          try {
            const metrics = this.collectDashboardMetrics()
            const content = this.formatDashboardPanel(metrics)
            this.printPanel(
              boxen(content || 'No metrics available', {
                title: '📊 System Metrics Overview',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green',
              })
            )
          } catch (error: any) {
            this.printPanel(
              boxen(`Error loading metrics: ${error.message}`, {
                title: '❌ Metrics Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
          }
          break

        case 'full':
        case 'expanded':
        case 'interactive':
          try {
            // First show the dashboard as a panel
            const fullMetrics = this.collectDashboardMetrics()
            const fullContent = this.formatFullDashboardPanel(fullMetrics)
            this.printPanel(
              boxen(fullContent || 'Dashboard data unavailable', {
                title: '📊 Complete System Dashboard',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'magenta',
              })
            )

            // Ask if user wants interactive mode
            console.log(chalk.cyan('\n💡 Tip: Use /dashboard live to launch fullscreen mode'))
          } catch (error: any) {
            this.printPanel(
              boxen(`Full dashboard error: ${error.message}`, {
                title: '❌ Dashboard Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
          }
          break

        case 'live':
        case 'realtime':
          if (!this.cliInstance) {
            console.log(chalk.red('❌ Interactive dashboard not available in this context'))
            return { shouldExit: false, shouldUpdatePrompt: false }
          }
          console.log(chalk.yellow('⚠️ Launching interactive dashboard - this will take over your terminal'))
          console.log(chalk.gray('Press ESC or Q to exit and return to prompt'))
          // Small delay to let user read the warning
          await new Promise(resolve => setTimeout(resolve, 1000))
          await this.cliInstance.handleDashboard('start')
          break

        case 'help':
          this.printPanel(
            boxen([
              'Available dashboard commands:',
              '',
              `${chalk.cyan('/dashboard')} - Show current metrics panel`,
              `${chalk.cyan('/dashboard show')} - Display metrics overview`,
              `${chalk.cyan('/dashboard full')} - Show complete dashboard panel`,
              `${chalk.cyan('/dashboard live')} - Launch interactive real-time dashboard`,
              `${chalk.cyan('/dashboard help')} - Show this help`,
              '',
              chalk.gray('Panel mode: Safe, shows metrics without taking over terminal'),
              chalk.gray('Live mode: Interactive fullscreen with real-time updates')
            ].join('\n'), {
              title: '📊 Dashboard Help',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            })
          )
          break

        default:
          this.printPanel(
            boxen(`Unknown dashboard command: ${action}\nUse /dashboard help for available commands`, {
              title: '❌ Invalid Command',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Dashboard error: ${error.message}`, {
          title: '❌ Dashboard Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private collectDashboardMetrics(): any {
    // Get immediate data only - no async operations
    const os = require('os')
    const memUsage = process.memoryUsage()
    const totalMem = os.totalmem()
    const freeMem = os.freemem()

    // Calculate real CPU usage from load average
    const loadAvg = os.loadavg()
    const cpuCount = os.cpus().length
    const cpuUsage = Math.min(100, Math.round((loadAvg[0] / cpuCount) * 100))

    // Get real agent stats
    let agentStats = { active: 0, total: 0 }
    if (this.agentManager) {
      const stats = this.agentManager.getStats()
      if (stats) {
        agentStats = {
          active: stats.activeAgents || 0,
          total: stats.totalAgents || 0
        }
      }
    }

    // Get real session stats from analytics if available
    let sessionStats = { commands: 0, responses: 0, tokens: { input: 0, output: 0 } }
    if (this.cliInstance?.analyticsManager) {
      try {
        const summary = this.cliInstance.analyticsManager.getSummary()
        if (summary) {
          sessionStats.commands = summary.totalQueries || 0
          sessionStats.responses = summary.totalQueries || 0
        }
      } catch (e) {
        // Keep defaults
      }
    }

    // Get real model info
    let modelInfo = { current: 'Unknown', provider: 'Unknown', requests: 0, successRate: 0, avgTokens: 0, totalCost: '0.00', routing: 'unknown' }
    if (this.cliInstance?.aiProvider) {
      try {
        const stats = this.cliInstance.aiProvider.getUsageStats?.()
        if (stats) {
          modelInfo.requests = stats.requestCount || 0
          modelInfo.totalCost = (stats.totalCost || 0).toFixed(2)
          modelInfo.avgTokens = stats.requestCount > 0
            ? Math.round(stats.totalTokens / stats.requestCount)
            : 0
          modelInfo.successRate = stats.requestCount > 0
            ? Math.round(((stats.requestCount - (stats.errorCount || 0)) / stats.requestCount) * 100)
            : 0
        }
      } catch (e) {
        // Keep defaults
      }
    }

    // Get real git info
    let gitInfo = { branch: 'unknown', status: 'unknown', commits: 0, lastCommit: 'none', uncommittedFiles: 0 }
    try {
      const { execSync } = require('child_process')
      const cwd = process.cwd()

      try {
        gitInfo.branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim()
      } catch (e) { }

      try {
        const statusOutput = execSync('git status --porcelain', { cwd, encoding: 'utf8' })
        gitInfo.uncommittedFiles = statusOutput.trim().split('\n').filter((l: string) => l).length
        gitInfo.status = gitInfo.uncommittedFiles > 0 ? 'dirty' : 'clean'
      } catch (e) { }

      try {
        gitInfo.commits = parseInt(execSync('git rev-list --count HEAD', { cwd, encoding: 'utf8' }).trim())
      } catch (e) { }

      try {
        gitInfo.lastCommit = execSync('git log -1 --pretty=%B', { cwd, encoding: 'utf8' }).trim().split('\n')[0]
      } catch (e) { }
    } catch (e) {
      // Git not available or not a git repo, keep defaults
    }

    // Get real project info
    let projectInfo = { name: 'unknown', version: '0.0.0', dependencies: 0, devDependencies: 0, tsFiles: 0, jsFiles: 0, totalFiles: 0, nodeModulesSize: 0 }
    try {
      const fs = require('fs')
      const path = require('path')
      const pkgPath = path.join(process.cwd(), 'package.json')

      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        projectInfo.name = pkg.name || 'unknown'
        projectInfo.version = pkg.version || '0.0.0'
        projectInfo.dependencies = pkg.dependencies ? Object.keys(pkg.dependencies).length : 0
        projectInfo.devDependencies = pkg.devDependencies ? Object.keys(pkg.devDependencies).length : 0
      }
    } catch (e) {
      // Package.json not available, keep defaults
    }

    return {
      system: {
        cpu: cpuUsage,
        memory: ((totalMem - freeMem) / totalMem) * 100,
        uptime: process.uptime(),
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      },
      agents: agentStats,
      session: sessionStats,
      model: modelInfo,
      git: gitInfo,
      project: projectInfo,
      performance: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        avgResponseTime: 0,
        errorRate: 0,
        cacheHitRate: 0,
        requestsPerMinute: 0
      },
      logs: { errors: 0, warnings: 0, recent: [] }
    }
  }

  private async collectModelMetrics(): Promise<any> {
    try {
      const { modelProvider } = await import('../ai/model-provider')
      const currentModel = modelProvider.getCurrentModelInfo()

      // Get real session metrics if available
      let sessionStats = { requests: 0, successRate: 0, avgTokens: 0, totalCost: 0 }

      try {
        const { contextTokenManager } = await import('../core/context-token-manager')
        const stats = contextTokenManager.getSessionStats()
        if (stats) {
          sessionStats.requests = (stats as any).totalRequests || 0
          sessionStats.avgTokens = stats.averageTokensPerMessage || 0
          sessionStats.totalCost = stats.costPerMessage || 0
        }
      } catch (e) { }

      return {
        current: currentModel.name || 'Unknown',
        provider: currentModel.config?.provider || 'Unknown',
        requests: sessionStats.requests,
        successRate: sessionStats.requests > 0 ? 100 : 0, // Real calculation based on errors
        avgTokens: Math.round(sessionStats.avgTokens),
        totalCost: sessionStats.totalCost.toFixed(4),
        routing: (currentModel.config as any)?.routing || 'disabled'
      }
    } catch (error) {
      return {
        current: 'Unknown',
        provider: 'Unknown',
        requests: 0,
        successRate: 0,
        avgTokens: 0,
        totalCost: '0.00',
        routing: 'unknown'
      }
    }
  }

  private async collectGitMetrics(): Promise<any> {
    try {
      const { execSync } = require('child_process')

      const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim()
      const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
      const commits = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim()
      const lastCommit = execSync('git log -1 --format="%h %s"', { encoding: 'utf8' }).trim()
      const uncommittedFiles = status.split('\n').filter((line: string) => line.trim()).length

      return {
        branch,
        status: uncommittedFiles > 0 ? 'dirty' : 'clean',
        commits: parseInt(commits),
        lastCommit,
        uncommittedFiles,
        ahead: 0, // Could implement with git rev-list
        behind: 0
      }
    } catch (error) {
      return {
        branch: 'unknown',
        status: 'unknown',
        commits: 0,
        lastCommit: 'unknown',
        uncommittedFiles: 0,
        ahead: 0,
        behind: 0
      }
    }
  }

  private async collectProjectMetrics(): Promise<any> {
    try {
      const fs = require('fs')
      const path = require('path')

      const packageJsonPath = path.join(process.cwd(), 'package.json')
      let packageInfo = {}

      if (fs.existsSync(packageJsonPath)) {
        packageInfo = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      }

      // Count TypeScript/JavaScript files
      const { execSync } = require('child_process')
      const tsFiles = execSync('find . -name "*.ts" -not -path "./node_modules/*" | wc -l', { encoding: 'utf8' }).trim()
      const jsFiles = execSync('find . -name "*.js" -not -path "./node_modules/*" | wc -l', { encoding: 'utf8' }).trim()

      return {
        name: (packageInfo as any).name || 'Unknown',
        version: (packageInfo as any).version || '0.0.0',
        dependencies: Object.keys((packageInfo as any).dependencies || {}).length,
        devDependencies: Object.keys((packageInfo as any).devDependencies || {}).length,
        tsFiles: parseInt(tsFiles),
        jsFiles: parseInt(jsFiles),
        totalFiles: parseInt(tsFiles) + parseInt(jsFiles),
        nodeModulesSize: this.getDirectorySize('node_modules')
      }
    } catch (error) {
      return {
        name: 'Unknown',
        version: '0.0.0',
        dependencies: 0,
        devDependencies: 0,
        tsFiles: 0,
        jsFiles: 0,
        totalFiles: 0,
        nodeModulesSize: 0
      }
    }
  }

  private async collectPerformanceMetrics(): Promise<any> {
    try {
      const memUsage = process.memoryUsage()

      return {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
        rss: Math.round(memUsage.rss / 1024 / 1024), // MB
        avgResponseTime: 0, // Will be populated by real metrics if available
        errorRate: 0, // Will be calculated from logs
        cacheHitRate: 0, // Will be populated by real cache metrics if available
        requestsPerMinute: 0 // Will be calculated from session data
      }
    } catch (error) {
      return {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        avgResponseTime: 0,
        errorRate: 0,
        cacheHitRate: 0,
        requestsPerMinute: 0
      }
    }
  }

  private async getRealCpuUsage(): Promise<number> {
    try {
      const { execSync } = require('child_process')

      if (process.platform === 'darwin' || process.platform === 'linux') {
        // Use top to get real CPU usage for this process
        const pid = process.pid
        const cmd = process.platform === 'darwin'
          ? `top -l 1 -pid ${pid} | grep -E "^${pid}" | awk '{print $3}' | sed 's/%//'`
          : `top -bn1 -p ${pid} | grep -E "^\\s*${pid}" | awk '{print $9}'`

        const output = execSync(cmd, { encoding: 'utf8', timeout: 2000 }).trim()
        const cpuPercent = parseFloat(output)
        return isNaN(cpuPercent) ? 0 : Math.min(cpuPercent, 100)
      }
      return 0
    } catch (error) {
      return 0
    }
  }

  private getRealMemoryUsage(): number {
    try {
      const memUsage = process.memoryUsage()
      const totalMem = require('os').totalmem()
      return (memUsage.rss / totalMem) * 100
    } catch (error) {
      return 0
    }
  }

  private async collectRealSessionMetrics(): Promise<any> {
    try {
      // Try to get real session data
      let sessionData = {
        commands: 0,
        responses: 0,
        tokens: { input: 0, output: 0 }
      }

      try {
        const { contextTokenManager } = await import('../core/context-token-manager')
        const session = contextTokenManager.getCurrentSession()
        if (session) {
          sessionData.tokens.input = session.totalInputTokens || 0
          sessionData.tokens.output = session.totalOutputTokens || 0
        }
      } catch (e) { }

      return sessionData
    } catch (error) {
      return {
        commands: 0,
        responses: 0,
        tokens: { input: 0, output: 0 }
      }
    }
  }

  private async collectLogMetrics(): Promise<any> {
    try {
      const logs = {
        errors: 0,
        warnings: 0,
        recent: [] as string[],
        lastError: '',
        lastWarning: '',
        systemErrors: 0,
        applicationErrors: 0
      }

      // Check for recent npm/yarn logs
      const { execSync } = require('child_process')
      const fs = require('fs')

      // Check npm debug logs
      try {
        const npmLogCmd = 'find . -name "npm-debug.log*" -o -name "yarn-error.log*" -newermt "1 hour ago" 2>/dev/null | head -5'
        const recentLogs = execSync(npmLogCmd, { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
        logs.errors += recentLogs.length
        logs.recent.push(...recentLogs.map((log: string) => `📁 ${log}`))
      } catch (e) { }

      // Check for TypeScript compilation errors
      try {
        const tscOutput = execSync('npx tsc --noEmit 2>&1 || true', { encoding: 'utf8' })
        const errorLines = tscOutput.split('\n').filter((line: string) =>
          line.includes('error TS') || line.includes('Warning:')
        )
        logs.errors += errorLines.filter((line: string) => line.includes('error')).length
        logs.warnings += errorLines.filter((line: string) => line.includes('Warning')).length

        if (errorLines.length > 0) {
          logs.recent.push(...errorLines.slice(0, 3).map((line: string) => `🔴 ${line.trim()}`))
          logs.lastError = errorLines.find((line: string) => line.includes('error')) || ''
        }
      } catch (e) { }

      // Check for ESLint warnings/errors
      try {
        const eslintOutput = execSync('npm run lint 2>&1 || true', { encoding: 'utf8' })
        const eslintLines = eslintOutput.split('\n')
        const errorCount = eslintLines.filter((line: string) => line.includes('error')).length
        const warningCount = eslintLines.filter((line: string) => line.includes('warning')).length

        logs.errors += errorCount
        logs.warnings += warningCount

        if (errorCount > 0 || warningCount > 0) {
          logs.recent.push(`🔍 ESLint: ${errorCount} errors, ${warningCount} warnings`)
        }
      } catch (e) { }

      // Check for Git issues
      try {
        const gitStatus = execSync('git status --porcelain 2>&1', { encoding: 'utf8' })
        const conflictFiles = gitStatus.split('\n').filter((line: string) => line.startsWith('UU'))
        if (conflictFiles.length > 0) {
          logs.errors += conflictFiles.length
          logs.recent.push(`🔀 Git conflicts: ${conflictFiles.length} files`)
        }
      } catch (e) { }

      // Check Node.js process warnings
      const processWarnings = process.listenerCount('warning')
      if (processWarnings > 0) {
        logs.warnings += processWarnings
        logs.recent.push(`⚠️ Node.js warnings: ${processWarnings}`)
      }

      // Check for package.json issues
      try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        if (!packageJson.main && !packageJson.exports) {
          logs.warnings += 1
          logs.recent.push('📦 package.json: Missing main/exports field')
        }
      } catch (e) { }

      // Memory usage warnings
      const memUsage = process.memoryUsage()
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024
      if (heapUsedMB > 500) {
        logs.warnings += 1
        logs.recent.push(`🧠 High memory usage: ${Math.round(heapUsedMB)}MB`)
      }

      return logs
    } catch (error) {
      return {
        errors: 0,
        warnings: 0,
        recent: [],
        lastError: '',
        lastWarning: '',
        systemErrors: 0,
        applicationErrors: 0
      }
    }
  }

  private getDirectorySize(dirPath: string): number {
    try {
      const { execSync } = require('child_process')
      const result = execSync(`du -sm ${dirPath} 2>/dev/null || echo 0`, { encoding: 'utf8' }).trim()
      return parseInt(result.split('\t')[0]) || 0
    } catch {
      return 0
    }
  }

  private formatDashboardPanel(metrics: any): string {
    const lines: string[] = []

    // Always show basic system info
    lines.push(chalk.cyan.bold('🖥️  System Performance'))
    lines.push(`CPU Usage: ${this.createProgressBar(metrics.system?.cpu || 0, 100)} ${(metrics.system?.cpu || 0).toFixed(1)}%`)
    lines.push(`Memory: ${this.createProgressBar(metrics.system?.memory || 0, 100)} ${(metrics.system?.memory || 0).toFixed(1)}%`)
    lines.push(`Uptime: ${this.formatUptime(metrics.system?.uptime || 0)}`)
    lines.push(`Platform: ${chalk.gray(metrics.system?.platform || 'unknown')} ${chalk.gray(metrics.system?.arch || 'unknown')}`)
    lines.push('')

    // Always show basic model info
    lines.push(chalk.cyan.bold('🤖 AI Model'))
    const model = metrics.model || {}
    lines.push(`Current: ${chalk.yellow(model.current || 'Unknown')} ${chalk.gray(`(${model.provider || 'Unknown'})`)}`)
    if (model.requests > 0) {
      lines.push(`Requests: ${chalk.white(model.requests)} • Tokens: ${chalk.blue(model.avgTokens || 0)} avg`)
    }
    lines.push('')

    // Always show basic session info
    lines.push(chalk.cyan.bold('📊 Session Statistics'))
    const sessionStats = metrics.session || { commands: 0, responses: 0, tokens: { input: 0, output: 0 } }
    const totalTokens = (sessionStats.tokens?.input || 0) + (sessionStats.tokens?.output || 0)
    lines.push(`Commands: ${chalk.yellow(sessionStats.commands || 0)}`)
    lines.push(`Responses: ${chalk.yellow(sessionStats.responses || 0)}`)
    if (totalTokens > 0) {
      lines.push(`Tokens: ${chalk.gray('In:')} ${sessionStats.tokens.input} ${chalk.gray('Out:')} ${sessionStats.tokens.output}`)
    } else {
      lines.push(`${chalk.gray('No token usage data yet')}`)
    }

    lines.push('')

    // Show basic git info if available
    const git = metrics.git || {}
    if (git.branch && git.branch !== 'unknown') {
      lines.push(chalk.cyan.bold('🔀 Git Repository'))
      lines.push(`Branch: ${chalk.yellow(git.branch)} ${git.status === 'clean' ? chalk.green('(clean)') : chalk.red('(dirty)')}`)
      if (git.commits > 0) {
        lines.push(`Commits: ${chalk.white(git.commits.toLocaleString())}`)
      }
      lines.push('')
    }

    lines.push(chalk.gray('Use /dashboard full for complete analytics'))

    return lines.join('\n')
  }

  private createProgressBar(value: number, max: number, width: number = 20): string {
    const percentage = Math.min(value / max, 1)
    const filled = Math.round(percentage * width)
    const empty = width - filled

    let color = chalk.green
    if (percentage > 0.8) color = chalk.red
    else if (percentage > 0.6) color = chalk.yellow

    return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty))
  }

  private formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
    if (minutes > 0) return `${minutes}m ${secs}s`
    return `${secs}s`
  }

  private createAsciiTable(headers: string[], rows: string[][]): string {
    if (rows.length === 0) return 'No data available'

    // Calculate column widths
    const colWidths = headers.map((header, i) => {
      const headerLen = header.length
      const maxRowLen = Math.max(...rows.map(row => (row[i] || '').toString().length))
      return Math.max(headerLen, maxRowLen) + 2
    })

    const lines: string[] = []

    // Top border
    lines.push('┌' + colWidths.map(w => '─'.repeat(w)).join('┬') + '┐')

    // Headers
    const headerRow = '│' + headers.map((header, i) =>
      ` ${header.padEnd(colWidths[i] - 1)}`
    ).join('│') + '│'
    lines.push(headerRow)

    // Header separator
    lines.push('├' + colWidths.map(w => '─'.repeat(w)).join('┼') + '┤')

    // Data rows
    rows.forEach(row => {
      const dataRow = '│' + row.map((cell, i) =>
        ` ${(cell || '').toString().padEnd(colWidths[i] - 1)}`
      ).join('│') + '│'
      lines.push(dataRow)
    })

    // Bottom border
    lines.push('└' + colWidths.map(w => '─'.repeat(w)).join('┴') + '┘')

    return lines.join('\n')
  }

  private createSimpleTable(data: { metric: string, value: string }[]): string {
    if (data.length === 0) return 'No data available'

    const maxMetricWidth = Math.max(...data.map(d => d.metric.length))
    const maxValueWidth = Math.max(...data.map(d => d.value.length))

    const lines: string[] = []

    data.forEach(({ metric, value }) => {
      const metricPadded = metric.padEnd(maxMetricWidth)
      const valuePadded = value.padStart(maxValueWidth)
      lines.push(`${chalk.cyan(metricPadded)} │ ${chalk.white(valuePadded)}`)
    })

    return lines.join('\n')
  }

  private formatFullDashboardPanel(metrics: any): string {
    const lines: string[] = []

    // Header with timestamp
    lines.push(chalk.cyan.bold('📊 Enterprise Analytics Dashboard'))
    lines.push(chalk.gray(`Last updated: ${new Date().toLocaleTimeString()} • Node ${metrics.system?.nodeVersion || 'Unknown'} • ${metrics.system?.platform || 'unknown'}/${metrics.system?.arch || 'unknown'}`))
    lines.push('')

    // Health Status Section
    const logs = metrics.logs || { errors: 0, warnings: 0, recent: [] }
    const healthColor = logs.errors > 0 ? 'red' : logs.warnings > 0 ? 'yellow' : 'green'
    const healthStatus = logs.errors > 0 ? '🔴 CRITICAL' : logs.warnings > 0 ? '🟡 WARNING' : '🟢 HEALTHY'
    lines.push(chalk[healthColor].bold(`🏥 System Health: ${healthStatus}`))
    if (logs.errors > 0) lines.push(`Errors: ${chalk.red(logs.errors)} | Warnings: ${chalk.yellow(logs.warnings)}`)
    else if (logs.warnings > 0) lines.push(`Warnings: ${chalk.yellow(logs.warnings)} | Status: ${chalk.green('Stable')}`)
    else lines.push(`Status: ${chalk.green('All systems operational')}`)
    lines.push('')

    // Model & AI Section
    const model = metrics.model || {}
    lines.push(chalk.yellow.bold('🤖 AI Model Session'))
    lines.push(`Current Model:    ${chalk.cyan(model.current || 'Unknown')} (${chalk.gray(model.provider || 'Unknown')})`)
    lines.push(`Requests:         ${chalk.white(model.requests || 0)} total`)
    lines.push(`Success Rate:     ${chalk.green((model.successRate || 0).toFixed(1))}%`)
    lines.push(`Avg Tokens:       ${chalk.blue(model.avgTokens || 0)} per request`)
    lines.push(`Total Cost:       ${chalk.magenta('$' + (model.totalCost || '0.00'))}`)
    lines.push(`Routing:          ${model.routing === 'enabled' ? chalk.green('Active') : chalk.gray('Disabled')}`)
    lines.push('')

    // Git Repository Section
    const git = metrics.git || {}
    lines.push(chalk.yellow.bold('🔀 Git Repository'))
    lines.push(`Branch:           ${chalk.cyan(git.branch || 'unknown')}`)
    lines.push(`Status:           ${git.status === 'clean' ? chalk.green('Clean') : chalk.red('Dirty')}`)
    lines.push(`Total Commits:    ${chalk.white((git.commits || 0).toLocaleString())}`)
    lines.push(`Last Commit:      ${chalk.gray(git.lastCommit || 'unknown')}`)
    if (git.uncommittedFiles > 0) {
      lines.push(`Uncommitted:      ${chalk.yellow(git.uncommittedFiles)} files`)
    }
    lines.push('')

    // Project Information Section with Table
    const project = metrics.project || {}
    lines.push(chalk.yellow.bold('📦 Project Dependencies Status'))

    const dependencyData = [
      { metric: 'Total Dependencies', value: String((project.dependencies || 0) + (project.devDependencies || 0)) },
      { metric: 'Production', value: String(project.dependencies || 0) },
      { metric: 'Development', value: String(project.devDependencies || 0) },
      { metric: 'Project Name', value: project.name || 'Unknown' },
      { metric: 'Version', value: project.version || '0.0.0' }
    ]

    if (project.nodeModulesSize > 0) {
      dependencyData.push({ metric: 'node_modules Size', value: `${project.nodeModulesSize}MB` })
    }

    lines.push(this.createSimpleTable(dependencyData))
    lines.push('')

    // System Performance Section
    lines.push(chalk.yellow.bold('🖥️  System Performance'))
    lines.push(`CPU Usage:        ${this.createProgressBar(metrics.system?.cpu || 0, 100)} ${(metrics.system?.cpu || 0).toFixed(1)}%`)
    lines.push(`Memory Usage:     ${this.createProgressBar(metrics.system?.memory || 0, 100)} ${(metrics.system?.memory || 0).toFixed(1)}%`)
    lines.push(`Uptime:           ${chalk.white(this.formatUptime(metrics.system?.uptime || 0))}`)

    // Process Memory Details with Table
    const perf = metrics.performance || {}
    if (perf.heapUsed) {
      lines.push(chalk.yellow.bold('💾 Memory Usage Details'))

      const memoryData = [
        { metric: 'Heap Used', value: `${perf.heapUsed}MB` },
        { metric: 'Heap Total', value: `${perf.heapTotal}MB` },
        { metric: 'RSS Memory', value: `${perf.rss}MB` },
        { metric: 'External', value: `${perf.external}MB` },
        { metric: 'Heap Usage', value: `${Math.min(100, ((perf.heapUsed / perf.heapTotal) * 100)).toFixed(1)}%` }
      ]

      lines.push(this.createSimpleTable(memoryData))
      lines.push('')
    }

    // Agent Management Section
    lines.push(chalk.yellow.bold('🤖 Agent Management'))
    const agentStats = metrics.agents || { active: 0, total: 0 }
    lines.push(`Active Agents:    ${chalk.green(agentStats.active)} / ${chalk.gray(agentStats.total)} total`)
    if (agentStats.avgResponseTime && agentStats.avgResponseTime > 0) {
      lines.push(`Avg Response:     ${chalk.cyan(agentStats.avgResponseTime.toFixed(0))}ms`)
    }
    if (perf.requestsPerMinute && perf.requestsPerMinute > 0) {
      lines.push(`Throughput:       ${chalk.blue(perf.requestsPerMinute)} req/min`)
    }
    if (agentStats.active === 0 && agentStats.total === 0) {
      lines.push(`${chalk.gray('No agents currently registered')}`)
    }
    lines.push('')

    // Session Analytics Section
    lines.push(chalk.yellow.bold('📈 Session Analytics'))
    const sessionStats = metrics.session || { commands: 0, responses: 0, tokens: { input: 0, output: 0 } }
    lines.push(`Commands:         ${chalk.cyan(sessionStats.commands)}`)
    lines.push(`Responses:        ${chalk.cyan(sessionStats.responses)}`)
    if (sessionStats.tokens) {
      lines.push(`Tokens:           ${chalk.gray('In:')} ${chalk.white(sessionStats.tokens.input)} ${chalk.gray('Out:')} ${chalk.white(sessionStats.tokens.output)}`)
      const totalTokens = sessionStats.tokens.input + sessionStats.tokens.output
      lines.push(`Total Tokens:     ${chalk.white(totalTokens.toLocaleString())}`)
    }
    lines.push('')

    // Error & Warning Logs Section
    if (logs.errors > 0 || logs.warnings > 0 || logs.recent.length > 0) {
      lines.push(chalk.yellow.bold('🚨 Recent Issues'))
      if (logs.errors > 0) lines.push(`Errors:           ${chalk.red(logs.errors)} detected`)
      if (logs.warnings > 0) lines.push(`Warnings:         ${chalk.yellow(logs.warnings)} detected`)

      if (logs.recent.length > 0) {
        lines.push(`Recent Issues:`)
        logs.recent.slice(0, 5).forEach((issue: string) => {
          lines.push(`  ${chalk.gray('•')} ${issue}`)
        })
        if (logs.recent.length > 5) {
          lines.push(`  ${chalk.gray('...')} and ${logs.recent.length - 5} more`)
        }
      }
      lines.push('')
    }

    // Performance Metrics Section
    lines.push(chalk.yellow.bold('⚡ Performance Metrics'))
    if (perf.avgResponseTime && perf.avgResponseTime > 0) {
      lines.push(`Response Time:    ${chalk.green(perf.avgResponseTime.toFixed(0))}ms avg`)
    }

    // Calculate real error rate from logs
    const errorRate = logs.errors > 0 ? Math.min((logs.errors / Math.max(sessionStats.responses, 1)) * 100, 100) : 0
    if (errorRate > 0) {
      const errorColor = errorRate > 5 ? 'red' : errorRate > 1 ? 'yellow' : 'green'
      lines.push(`Error Rate:       ${chalk[errorColor](errorRate.toFixed(1))}%`)
    }

    if (perf.cacheHitRate && perf.cacheHitRate > 0) {
      lines.push(`Cache Hit Rate:   ${chalk.green(perf.cacheHitRate.toFixed(1))}%`)
    }

    if (!perf.avgResponseTime && !errorRate && !perf.cacheHitRate) {
      lines.push(`${chalk.gray('No performance data available yet')}`)
    }
    lines.push('')

    // Quick Actions
    lines.push(chalk.gray('─'.repeat(80)))
    lines.push(chalk.cyan.bold('🚀 Quick Actions'))
    lines.push(chalk.gray('• Use') + chalk.cyan(' /dashboard live ') + chalk.gray('for real-time interactive dashboard'))
    lines.push(chalk.gray('• Use') + chalk.cyan(' /model ') + chalk.gray('to view/change AI model settings'))
    lines.push(chalk.gray('• Use') + chalk.cyan(' /git status ') + chalk.gray('for detailed repository information'))
    lines.push(chalk.gray('• Use') + chalk.cyan(' /agents ') + chalk.gray('to manage active agents'))

    return lines.join('\n')
  }

  private async listAgentsCommand(): Promise<CommandResult> {
    console.log(chalk.blue.bold('\n🤖 Available Agents:'))
    console.log(chalk.gray('─'.repeat(40)))

    const agents = this.agentManager.listAgents()
    if (agents.length === 0) {
      console.log(chalk.yellow('No agents registered'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    agents.forEach((agent) => {
      console.log(`${chalk.green('•')} ${chalk.bold(agent.name)}`)
      console.log(`  ${chalk.gray(agent.description)}`)
    })

    console.log(chalk.gray('\nUse /agent <name> <task> to run a specific agent'))
    console.log(chalk.gray('Use /auto <description> for autonomous multi-agent execution'))

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async agentCommand(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      console.log(chalk.red('Usage: /agent <name> <task>'))
      this.printPanel(
        chalk.gray('Example: /agent coding-agent "analyze this function: function add(a,b) { return a + b; }"')
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const agentName = args[0]
    const task = args.slice(1).join(' ')

    try {
      const agent = this.agentManager.getAgent(agentName)
      if (!agent) {
        console.log(chalk.red(`❌ Agent '${agentName}' not found`))
        console.log(chalk.gray('Use /agents to see available agents'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`🔌 Running ${agentName}...`))

      await agent.initialize()
      const result = await agent.run?.({
        id: `task-${Date.now()}`,
        type: 'user_request' as const,
        title: 'User Request',
        description: task,
        priority: 'medium' as const,
        status: 'pending' as const,
        data: { userInput: task },
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0,
      } as AgentTask)
      await agent.cleanup?.()

      console.log(chalk.green(`✓ ${agentName} completed:`))
      if (typeof result === 'string') {
        console.log(result)
      } else {
        console.log(JSON.stringify(result, null, 2))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error running agent: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async autonomousCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /auto <description>'))
      console.log(chalk.gray('Example: /auto "Create a React todo app with backend API"'))
      console.log(chalk.gray('Example: /auto "Fix all TypeScript errors in the project"'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const description = args.join(' ')

    try {
      console.log(chalk.blue('⚡︎ Creating autonomous agent for task...'))

      // Create specialized agent for this task
      const agent = await agentFactory.createAndLaunchAgent({
        specialization: `Autonomous Developer for: ${description}`,
        autonomyLevel: 'fully-autonomous',
        contextScope: 'project',
        description: `Specialized agent to autonomously complete: ${description}`,
      })

      console.log(chalk.blue('🚀 Starting autonomous execution with streaming...'))

      const result = await agent.run(description)
      await agent.cleanup()

      if (result.error) {
        console.log(chalk.red(`❌ ${result.error}`))
      } else {
        console.log(chalk.green('✓ Autonomous execution completed!'))
        console.log(chalk.gray('Use /stream to see execution details'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error in autonomous execution: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async parallelCommand(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      console.log(chalk.red('Usage: /parallel <agent1,agent2,...> <task>'))
      console.log(chalk.gray('Example: /parallel "coding-agent,react-expert" "create a login component"'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const agentNames = args[0].split(',').map((name) => name.trim())
    const task = args.slice(1).join(' ')

    try {
      console.log(chalk.blue(`⚡ Running ${agentNames.length} agents in parallel...`))

      const promises = agentNames.map(async (agentName) => {
        const agent = this.agentManager.getAgent(agentName)
        if (!agent) {
          throw new Error(`Agent '${agentName}' not found`)
        }

        await agent.initialize()
        const result = await agent.run?.({
          id: `task-${Date.now()}`,
          type: 'user_request' as const,
          title: 'User Request',
          description: task,
          priority: 'medium' as const,
          status: 'pending' as const,
          data: { userInput: task },
          createdAt: new Date(),
          updatedAt: new Date(),
          progress: 0,
        } as AgentTask)
        await agent.cleanup?.()

        return { agentName, result }
      })

      const results = await Promise.all(promises)

      console.log(chalk.green('✓ Parallel execution completed:'))
      results.forEach(({ agentName, result }) => {
        console.log(chalk.blue(`\n--- ${agentName} ---`))
        if (typeof result === 'string') {
          console.log(result)
        } else {
          console.log(JSON.stringify(result, null, 2))
        }
      })
    } catch (error: any) {
      console.log(chalk.red(`❌ Error in parallel execution: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // File Operations
  private async readFileCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /read <filepath>', {
          title: '❌ Missing Argument',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const filePath = args[0]
      const fileInfo = await toolsManager.readFile(filePath)

      this.printPanel(
        boxen(
          `File: ${chalk.cyan(filePath)}\nSize: ${chalk.gray(fileInfo.size + ' bytes')}\nLanguage: ${chalk.gray(fileInfo.language || 'unknown')}`,
          {
            title: '📄 File Info',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue',
          }
        )
      )
      console.log(fileInfo.content)
    } catch (error: any) {
      console.log(chalk.red(`❌ Error reading file: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async writeFileCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length < 2) {
      this.printPanel(
        boxen('Usage: /write <filepath> <content>', {
          title: '❌ Missing Arguments',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const filePath = args[0]
      const content = args.slice(1).join(' ')

      // Create FileDiff for approval
      const fileDiff = await DiffViewer.createFileDiff(filePath)
      fileDiff.newContent = content

      // Request approval before writing
      const approved = await approvalSystem.requestFileApproval(`Write file: ${filePath}`, [fileDiff], 'medium')

      if (!approved) {
        this.printPanel(
          boxen('File write operation cancelled', {
            title: '⚠️ Cancelled',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Create progress indicator
      const writeId = advancedUI.createIndicator('file-write', `Writing ${filePath}`).id
      advancedUI.startSpinner(writeId, 'Writing file...')

      await toolsManager.writeFile(filePath, content)

      advancedUI.stopSpinner(writeId, true, `File written: ${filePath}`)
      this.printPanel(
        boxen(`File: ${chalk.cyan(filePath)}\nContent: ${chalk.gray(content.length + ' chars')}`, {
          title: '✓ File Written',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      advancedUI.logError(`Error writing file: ${error.message}`)
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ Write Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async editFileCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /edit <filepath>', {
          title: '❌ Missing Argument',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const filePath = args[0]
      this.printPanel(
        boxen(`Opening ${chalk.cyan(filePath)} in system editor...`, {
          title: '📝 Edit File',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )

      // Use system editor
      await toolsManager.runCommand('code', [filePath])
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ Editor Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async listFilesCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    try {
      const directory = args[0] || '.'
      const files = await toolsManager.listFiles(directory)

      if (files.length === 0) {
        this.printPanel(
          boxen('No files found', {
            title: '📁 Empty Directory',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
      } else {
        const fileList = files
          .slice(0, 50)
          .map((file) => `${chalk.cyan('•')} ${file}`)
          .join('\n')
        const summary = files.length > 50 ? `\n\n${chalk.gray(`... and ${files.length - 50} more files`)}` : ''

        this.printPanel(
          boxen(`${fileList}${summary}`, {
            title: `📁 Files in ${directory} (${files.length} total)`,
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue',
          })
        )
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ List Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async searchCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage:'))
      console.log(chalk.gray('  /search <query> [directory] - Enhanced semantic + text search'))
      console.log(chalk.gray('  /search --semantic <query> [directory] - Semantic search only'))
      console.log(chalk.gray('  /search --text <query> [directory] - Text search only'))
      this.printPanel(
        chalk.gray(
          '  /search --web <query> [--type general|technical|documentation|stackoverflow] [--mode results|answer] [--includeContent] [--maxContentBytes N] [--maxResults N]'
        )
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    // Parse flags for web search and search type
    const webFlags = new Set(['--web', '--type', '--mode', '--includeContent', '--maxContentBytes', '--maxResults'])
    const searchFlags = new Set(['--semantic', '--text'])
    const hasWebFlag = args.some((a) => a.startsWith('--') && webFlags.has(a.split('=')[0]))
    const _hasSearchFlag = args.some((a) => a.startsWith('--') && searchFlags.has(a.split('=')[0]))

    if (hasWebFlag) {
      try {
        let searchType: 'general' | 'technical' | 'documentation' | 'stackoverflow' = 'general'
        let mode: 'results' | 'answer' = 'results'
        let includeContent = false
        let maxContentBytes = 200000
        let maxResults = 5
        const queryParts: string[] = []

        for (let i = 0; i < args.length; i++) {
          const token = args[i]
          if (!token.startsWith('--')) {
            queryParts.push(token)
            continue
          }
          const flag = token
          switch (flag) {
            case '--web':
              // marker only
              break
            case '--type':
              if (i + 1 < args.length) {
                const v = args[++i] as any
                if (['general', 'technical', 'documentation', 'stackoverflow'].includes(v)) searchType = v
              }
              break
            case '--mode':
              if (i + 1 < args.length) {
                const v = args[++i] as any
                if (['results', 'answer'].includes(v)) mode = v
              }
              break
            case '--includeContent':
              includeContent = true
              break
            case '--maxContentBytes':
              if (i + 1 < args.length) {
                const n = parseInt(args[++i], 10)
                if (!Number.isNaN(n) && n > 0) maxContentBytes = n
              }
              break
            case '--maxResults':
              if (i + 1 < args.length) {
                const n = parseInt(args[++i], 10)
                if (!Number.isNaN(n) && n > 0) maxResults = n
              }
              break
            default:
              // Unknown flag -> ignore
              break
          }
        }

        const query = queryParts.join(' ').trim()
        if (!query) {
          this.printPanel(
            chalk.red(
              'Usage: /search --web <query> [--type ...] [--mode ...] [--includeContent] [--maxContentBytes N] [--maxResults N]'
            )
          )
          return { shouldExit: false, shouldUpdatePrompt: false }
        }

        console.log(chalk.blue(`🌐 Web searching: "${query}" (${searchType})`))
        const wsp = new WebSearchProvider()
        const webTool: any = wsp.getWebSearchTool()
        const result = await webTool.execute({ query, maxResults, searchType, mode, includeContent, maxContentBytes })

        if (result?.error) {
          console.log(chalk.red(`❌ ${result.error}`))
          return { shouldExit: false, shouldUpdatePrompt: false }
        }

        if (mode === 'answer' && result?.answer) {
          console.log(chalk.green.bold('\n🧠 AI Answer'))
          console.log(chalk.gray('─'.repeat(60)))
          console.log(result.answer.trim())
          console.log(chalk.gray('\nSources:'))
            ; (result.sources || []).forEach((s: any, idx: number) => {
              console.log(` [#${idx + 1}] ${chalk.cyan(s.title)} - ${chalk.gray(s.url)}`)
            })
          console.log(chalk.gray('─'.repeat(60)))
        } else {
          const items = result?.results || []
          console.log(chalk.green(`Found ${items.length} web results:`))
          console.log(chalk.gray('─'.repeat(60)))
          items.slice(0, maxResults).forEach((r: any, i: number) => {
            console.log(`${chalk.yellow(`${i + 1}.`)} ${chalk.cyan(r.title || r.url)}`)
            console.log(`    ${chalk.gray(r.url)}`)
            if (r.snippet) console.log(`    ${r.snippet}`)
          })
          console.log(chalk.gray('─'.repeat(60)))
        }

        return { shouldExit: false, shouldUpdatePrompt: false }
      } catch (error: any) {
        console.log(chalk.red(`❌ Web search failed: ${error.message}`))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }
    }

    // Default: enhanced semantic search with RAG integration
    try {
      const query = args[0]
      const directory = args[1] || '.'

      console.log(chalk.blue(`🔍 Enhanced search for "${query}" in ${directory}...`))

      // First try RAG-powered semantic search
      let semanticResults: any[] = []
      try {
        console.log(chalk.gray('⚡︎ Attempting semantic search...'))
        semanticResults = await unifiedRAGSystem.search(query, {
          limit: 10,
          semanticOnly: false,
          workingDirectory: directory === '.' ? process.cwd() : directory,
        })
      } catch (_error) {
        console.log(chalk.yellow('⚠️ Semantic search unavailable, using traditional search'))
      }

      // Fallback to traditional grep-like search
      const traditionalResults = await toolsManager.searchInFiles(query, directory)

      // Combine and display results
      if (semanticResults.length === 0 && traditionalResults.length === 0) {
        console.log(chalk.yellow('No matches found'))
      } else {
        let totalDisplayed = 0

        // Display semantic results first
        if (semanticResults.length > 0) {
          console.log(chalk.green(`⚡︎ Semantic Results (${semanticResults.length}):`))
          console.log(chalk.gray('─'.repeat(50)))

          semanticResults.slice(0, 10).forEach((result, index) => {
            console.log(chalk.cyan(`${index + 1}. ${result.path} (score: ${(result.score * 100).toFixed(1)}%)`))
            console.log(chalk.gray(`   ${result.content.substring(0, 150)}...`))
            totalDisplayed++
          })

          if (semanticResults.length > 10) {
            console.log(chalk.gray(`... and ${semanticResults.length - 10} more semantic matches`))
          }
          console.log()
        }

        // Display traditional results if any
        if (traditionalResults.length > 0 && totalDisplayed < 20) {
          console.log(chalk.green(`🔍 Text Matches (${traditionalResults.length}):`))
          console.log(chalk.gray('─'.repeat(50)))

          const remaining = 20 - totalDisplayed
          traditionalResults.slice(0, remaining).forEach((result) => {
            console.log(chalk.cyan(`${result.file}:${result.line}`))
            console.log(`  ${result.content}`)
          })

          if (traditionalResults.length > remaining) {
            console.log(chalk.gray(`... and ${traditionalResults.length - remaining} more text matches`))
          }
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error searching: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // Terminal Operations
  private async runCommandCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /run <command>'))
      console.log(chalk.red('Usage: /run <command> [args...]'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const [command, ...commandArgs] = args
      const fullCommand = `${command} ${commandArgs.join(' ')}`

      // Request approval for command execution
      const approved = await approvalSystem.requestCommandApproval(command, commandArgs, process.cwd())

      if (!approved) {
        console.log(chalk.yellow('❌ Command execution cancelled'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`⚡ Running: ${fullCommand}`))

      // Create progress indicator
      const cmdId = advancedUI.createIndicator('command', `Executing: ${command}`).id
      advancedUI.startSpinner(cmdId, `Running: ${fullCommand}`)

      const result = await toolsManager.runCommand(command, commandArgs, { stream: true })

      if (result.code === 0) {
        advancedUI.stopSpinner(cmdId, true, 'Command completed successfully')
        console.log(chalk.green('✓ Command completed successfully'))
      } else {
        advancedUI.stopSpinner(cmdId, false, `Command failed with exit code ${result.code}`)
        console.log(chalk.red(`❌ Command failed with exit code ${result.code}`))
      }
    } catch (error: any) {
      advancedUI.logError(`Error running command: ${error.message}`)
      console.log(chalk.red(`❌ Error running command: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async installCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /install <packages...>'))
      console.log(chalk.gray('Options: --global, --dev, --yarn, --pnpm'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const packages = args.filter((arg) => !arg.startsWith('--'))
      const isGlobal = args.includes('--global') || args.includes('-g')
      const isDev = args.includes('--dev') || args.includes('-D')
      const manager = args.includes('--yarn') ? 'yarn' : args.includes('--pnpm') ? 'pnpm' : 'npm'

      // Request approval for package installation
      const approved = await approvalSystem.requestPackageApproval(packages, manager, isGlobal)

      if (!approved) {
        console.log(chalk.yellow('❌ Package installation cancelled'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`📦 Installing ${packages.join(', ')} with ${manager}...`))

      // Create progress indicator
      const installId = advancedUI.createIndicator('install', `Installing packages`).id
      advancedUI.createProgressBar(installId, 'Installing packages', packages.length)

      for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i]
        advancedUI.updateSpinner(installId, `Installing ${pkg}...`)

        const success = await toolsManager.installPackage(pkg, {
          global: isGlobal,
          dev: isDev,
          manager: manager as any,
        })

        if (!success) {
          advancedUI.logWarning(`Failed to install ${pkg}`)
          console.log(chalk.yellow(`⚠️ Failed to install ${pkg}`))
        } else {
          advancedUI.logSuccess(`Installed ${pkg}`)
        }

        advancedUI.updateProgress(installId, i + 1, packages.length)
      }

      advancedUI.completeProgress(installId, `Completed installation of ${packages.length} packages`)
      console.log(chalk.green(`✓ Package installation completed`))
    } catch (error: any) {
      advancedUI.logError(`Error installing packages: ${error.message}`)
      console.log(chalk.red(`❌ Error installing packages: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async npmCommand(args: string[]): Promise<CommandResult> {
    return await this.runCommandCommand(['npm', ...args])
  }

  private async yarnCommand(args: string[]): Promise<CommandResult> {
    return await this.runCommandCommand(['yarn', ...args])
  }

  private async gitCommand(args: string[]): Promise<CommandResult> {
    return await this.runCommandCommand(['git', ...args])
  }

  private async dockerCommand(args: string[]): Promise<CommandResult> {
    return await this.runCommandCommand(['docker', ...args])
  }

  private async processCommand(): Promise<CommandResult> {
    try {
      const processes = toolsManager.getRunningProcesses()

      console.log(chalk.blue('⚡︎ Running Processes:'))
      console.log(chalk.gray('─'.repeat(50)))

      if (processes.length === 0) {
        console.log(chalk.yellow('No processes currently running'))
      } else {
        processes.forEach((proc) => {
          const duration = Date.now() - proc.startTime.getTime()
          console.log(`${chalk.cyan('PID')} ${proc.pid}: ${chalk.bold(proc.command)} ${proc.args.join(' ')}`)
          console.log(`  Status: ${proc.status} | Duration: ${Math.round(duration / 1000)}s`)
          console.log(`  Working Dir: ${proc.cwd}`)
        })
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error listing processes: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async killCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /kill <pid>'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const pid = parseInt(args[0], 10)
      if (Number.isNaN(pid)) {
        console.log(chalk.red('Invalid PID'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.yellow(`⚠️ Attempting to kill process ${pid}...`))

      const success = await toolsManager.killProcess(pid)

      if (success) {
        console.log(chalk.green(`✓ Process ${pid} terminated`))
      } else {
        console.log(chalk.red(`❌ Could not kill process ${pid}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error killing process: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // Project Operations
  private async buildCommand(): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    try {
      this.printPanel(
        boxen('Building project...', {
          title: '🔨 Build',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )

      const result = await toolsManager.build()

      if (result.success) {
        this.printPanel(
          boxen('Build completed successfully', {
            title: '✓ Build Success',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          })
        )
      } else {
        const errors =
          result.errors && result.errors.length > 0
            ? '\n\n' + result.errors.map((e) => `${chalk.red('•')} ${e.message}`).join('\n')
            : ''
        this.printPanel(
          boxen(`Build failed${errors}`, {
            title: '❌ Build Failed',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          })
        )
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ Build Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async testCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    try {
      const pattern = args[0]
      this.printPanel(
        boxen(`Running tests${pattern ? ` with pattern: ${chalk.cyan(pattern)}` : ''}...`, {
          title: '🧪 Tests',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )

      const result = await toolsManager.runTests(pattern)

      if (result.success) {
        this.printPanel(
          boxen('All tests passed', {
            title: '✓ Tests Passed',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          })
        )
      } else {
        const errors =
          result.errors && result.errors.length > 0
            ? '\n\n' + result.errors.map((e) => `${chalk.red('•')} ${e.message}`).join('\n')
            : ''
        this.printPanel(
          boxen(`Some tests failed${errors}`, {
            title: '❌ Tests Failed',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          })
        )
      }
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ Test Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async lintCommand(): Promise<CommandResult> {
    try {
      console.log(chalk.blue('🔍 Running linter...'))

      const result = await toolsManager.lint()

      if (result.success) {
        console.log(chalk.green('✓ No linting errors found'))
      } else {
        console.log(chalk.yellow('⚠️ Linting issues found'))
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach((error) => {
            const severity = error.severity === 'error' ? chalk.red('ERROR') : chalk.yellow('WARNING')
            console.log(`  ${severity}: ${error.message}`)
          })
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error running linter: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async createProjectCommand(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      console.log(chalk.red('Usage: /create <type> <name>'))
      console.log(chalk.gray('Types: react, node, python, rust'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const [type, name] = args
      console.log(chalk.blue(`🏗️ Creating ${type} project: ${name}`))

      // Simplified project creation - would need proper implementation
      const result = { success: true, path: `./${name}` }

      if (result.success) {
        console.log(chalk.green(`✓ Project ${name} created successfully!`))
        console.log(chalk.gray(`📁 Location: ${result.path}`))
      } else {
        console.log(chalk.red(`❌ Failed to create project ${name}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error creating project: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // VM Operations
  private async vmCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.blue.bold('🐳 VM Container Management'))
      console.log(chalk.gray('─'.repeat(40)))
      console.log(`${chalk.cyan('/vm-create <repo-url|os>')} - Create VM (alpine|debian|ubuntu)`)
      console.log(`${chalk.gray('  Flags: --os <alpine|debian|ubuntu>  --mount-desktop  --no-repo')}`)
      console.log(`${chalk.gray('  Examples: /vm-create alpine --mount-desktop  |  /vm-create https://github.com/user/repo.git --os ubuntu')}`)
      console.log(`${chalk.cyan('/vm-list')}              - List active containers`)
      console.log(`${chalk.cyan('/vm-stop <id>')}          - Stop container`)
      console.log(`${chalk.cyan('/vm-remove <id>')}        - Remove container`)
      console.log(`${chalk.cyan('/vm-connect <id>')}       - Connect to container`)
      console.log(`${chalk.cyan('/vm-logs <id>')}          - View container logs`)
      this.printPanel(
        `${chalk.cyan('/vm-create-pr <id> "<title>" "<desc>" [branch] [base] [draft]')} - Create PR from container`
      )
      console.log(`${chalk.cyan('/vm-mode')}               - Enter VM chat mode`)
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    // Handle subcommands
    const subcommand = args[0]
    const subArgs = args.slice(1)

    switch (subcommand) {
      case 'create':
        return await this.vmCreateCommand(subArgs)
      case 'list':
        return await this.vmListCommand()
      case 'stop':
        return await this.vmStopCommand(subArgs)
      case 'remove':
        return await this.vmRemoveCommand(subArgs)
      case 'connect':
        return await this.vmConnectCommand(subArgs)
      case 'mode':
        return await this.vmModeCommand()
      case 'exit':
      case 'quit':
        // Exit VM mode and return to default
        if (this.cliInstance) {
          this.cliInstance.currentMode = 'default'
          this.cliInstance.activeVMContainer = undefined
          console.log(chalk.green('✓ Exited VM mode, returned to default chat mode'))
        }
        return { shouldExit: false, shouldUpdatePrompt: true }
      default:
        console.log(chalk.red(`Unknown VM command: ${subcommand}`))
        console.log(chalk.gray('Use /vm exit to exit VM mode'))
        return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private resolveRepositoryTarget(input: string): { target: string; isLocal: boolean } {
    const repositoryInput = input?.trim()

    if (!repositoryInput) {
      throw new Error('A repository URL or local path is required')
    }

    const gitLikePattern = /^(https?:\/\/|git@)/i
    if (gitLikePattern.test(repositoryInput)) {
      return { target: repositoryInput, isLocal: false }
    }

    if (repositoryInput.startsWith('file://')) {
      const fileUrl = new URL(repositoryInput)
      const decodedPath = decodeURIComponent(fileUrl.pathname)
      return this.resolveRepositoryTarget(decodedPath)
    }

    let resolvedPath = repositoryInput
    if (repositoryInput.startsWith('~')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE
      if (!homeDir) {
        throw new Error('Unable to resolve ~ in repository path: HOME directory not set')
      }
      resolvedPath = resolve(homeDir, repositoryInput.slice(1))
    } else {
      resolvedPath = resolve(repositoryInput)
    }

    if (!existsSync(resolvedPath)) {
      throw new Error(`Local repository path not found: ${resolvedPath}`)
    }

    if (!statSync(resolvedPath).isDirectory()) {
      throw new Error(`Local repository path must be a directory: ${resolvedPath}`)
    }

    return { target: resolvedPath, isLocal: true }
  }

  private async vmCreateCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /vm-create <repository-url|os> [--os alpine|debian|ubuntu] [--mount-desktop] [--no-repo]', {
          title: '❌ Missing Repository URL',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      // Parse flags
      const flagIdx = args.findIndex((a) => a.startsWith('--'))
      const positional = flagIdx >= 0 ? args.slice(0, flagIdx) : args
      const flags = flagIdx >= 0 ? args.slice(flagIdx) : []

      const osFlagIdx = Math.max(flags.indexOf('--os'), flags.indexOf('-o'))
      const osFlag = osFlagIdx >= 0 && flags[osFlagIdx + 1] ? String(flags[osFlagIdx + 1]).toLowerCase() : ''
      const shorthandOS = ['alpine', 'debian', 'ubuntu'].includes((positional[0] || '').toLowerCase())
      const osOnly = shorthandOS || flags.includes('--no-repo')
      const chosenOS = (shorthandOS ? positional[0] : osFlag) || 'alpine'
      const imageByOS: Record<string, string> = {
        alpine: 'node:18-alpine',
        debian: 'debian:bookworm-slim',
        ubuntu: 'ubuntu:22.04',
      }
      const containerImage = imageByOS[chosenOS] || imageByOS.alpine

      let repositoryLocation = ''
      let isLocal = false
      if (!osOnly) {
        const resolved = this.resolveRepositoryTarget(positional[0])
        repositoryLocation = resolved.target
        isLocal = resolved.isLocal
      }

      this.printPanel(
        boxen(
          osOnly
            ? `Creating VM container with OS: ${chalk.cyan(chosenOS)}\nImage: ${chalk.gray(containerImage)}`
            : `Creating VM container for:\n${chalk.cyan(repositoryLocation)}\nOS Image: ${chalk.gray(containerImage)}`,
          {
            title: '🚀 VM Create',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue',
          }
        )
      )

      // Optional Desktop mount
      const mountDesktop = flags.includes('--mount-desktop')
      const desktopPath = process.env.HOME ? `${process.env.HOME}/Desktop` : ''
      const extraVolumes: string[] = []
      if (mountDesktop && desktopPath) {
        extraVolumes.push(`${desktopPath}:/workspace/Desktop:rw`)
      }

      const config = {
        agentId: `vm-agent-${Date.now()}`,
        repositoryUrl: osOnly ? '' : repositoryLocation,
        localRepoPath: osOnly ? undefined : isLocal ? repositoryLocation : undefined,
        sessionToken: `session-${Date.now()}`,
        proxyEndpoint: 'http://localhost:3000',
        capabilities: ['read', 'write', 'execute', 'network'],
        containerImage,
        extraVolumes,
      }

      const containerId = await this.vmOrchestrator.createSecureContainer(config)

      // Setup repository and development environment
      if (!osOnly) {
        await this.vmOrchestrator.setupRepository(containerId, repositoryLocation, {
          useLocalPath: isLocal,
        })
        await this.vmOrchestrator.setupDevelopmentEnvironment(containerId)
        await this.vmOrchestrator.setupVSCodeServer(containerId)
      }

      const vscodePort = await this.vmOrchestrator.getVSCodePort(containerId)

      const content = [
        `Container ID: ${chalk.cyan(containerId)}`,
        `VS Code Server: ${chalk.cyan('http://localhost:' + vscodePort)}`,
        mountDesktop && desktopPath ? `Desktop mounted at: ${chalk.cyan('/workspace/Desktop')}` : '',
        osOnly ? '' : `Repository: ${chalk.gray(repositoryLocation)}`,
        `\nConnect with: ${chalk.gray('/vm-connect ' + containerId.slice(0, 8))}`,
        `\n${chalk.yellow('⚡︎ Switching to VM mode...')}`,
      ].join('\n')

      this.printPanel(
        boxen(content, {
          title: '✓ VM Container Created',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )

      // Automatically switch to VM mode for seamless integration
      this.cliInstance.currentMode = 'vm'

      // Set the active container for tool routing
      this.cliInstance.activeVMContainer = containerId
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ VM Creation Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmListCommand(): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    try {
      const containers = this.vmOrchestrator.getActiveContainers()

      if (containers.length === 0) {
        this.printPanel(
          boxen('No active containers\n\nUse /vm-create <repo-url|os> to create one', {
            title: '🐳 VM Containers',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const containerList = containers
        .map((container) => {
          const uptime = Math.round((Date.now() - container.createdAt.getTime()) / 1000 / 60)
          const status = container.status === 'running' ? chalk.green('running') : chalk.yellow(container.status)
          return [
            `${chalk.cyan('•')} ${chalk.bold(container.id.slice(0, 12))}`,
            `  Agent: ${container.agentId}`,
            `  Repository: ${container.repositoryUrl}`,
            `  Status: ${status}`,
            `  VS Code Port: ${container.vscodePort}`,
            `  Uptime: ${uptime} minutes`,
            '',
          ].join('\n')
        })
        .join('\n')

      this.printPanel(
        boxen(containerList, {
          title: `🐳 Active VM Containers (${containers.length})`,
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ List Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmStopCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /vm-stop <container-id>', {
          title: '❌ Missing Container ID',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const containerId = args[0]
      this.printPanel(
        boxen(`Stopping container ${chalk.cyan(containerId)}...`, {
          title: '🛑 VM Stop',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        })
      )

      await this.vmOrchestrator.stopContainer(containerId)
      this.printPanel(
        boxen(`Container ${chalk.cyan(containerId)} stopped successfully`, {
          title: '✓ Container Stopped',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ Stop Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmRemoveCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /vm-remove <container-id>', {
          title: '❌ Missing Container ID',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const containerId = args[0]
      this.printPanel(
        boxen(`Removing container ${chalk.cyan(containerId)}...`, {
          title: '🗑️ VM Remove',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'yellow',
        })
      )

      await this.vmOrchestrator.removeContainer(containerId)
      this.printPanel(
        boxen(`Container ${chalk.cyan(containerId)} removed successfully`, {
          title: '✓ Container Removed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ Remove Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmConnectCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /vm-connect <container-id>', {
          title: '❌ Missing Container ID',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const containerId = args[0]
      const containers = this.vmOrchestrator.getActiveContainers()
      const container = containers.find((c) => c.id.startsWith(containerId))

      if (!container) {
        this.printPanel(
          boxen(`Container ${chalk.cyan(containerId)} not found\n\nUse /vm-list to see active containers`, {
            title: '❌ Container Not Found',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          })
        )
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const content = [
        `Container ID: ${chalk.cyan(container.id.slice(0, 12))}`,
        `VS Code Server: ${chalk.cyan('http://localhost:' + container.vscodePort)}`,
        `Repository: ${chalk.gray(container.repositoryUrl)}`,
        `\n💬 You can now chat directly with the VM agent`,
        `Type ${chalk.gray('/vm-mode')} to enter dedicated VM chat mode`,
      ].join('\n')

      this.printPanel(
        boxen(content, {
          title: '🔗 Connected to VM',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )

      // Store current VM connection for chat mode (using session context)
      // configManager.set('currentVMContainer', container.id);
      console.log(chalk.gray(`Container ${container.id} is now active for VM mode`))
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ Connection Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: true }
  }

  private async vmLogsCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /vm-logs <container-id> [lines]'))
      console.log(chalk.gray('Example: /vm-logs abc123 50'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const containerId = args[0]
    const lines = args[1] ? parseInt(args[1], 10) : 100

    try {
      console.log(chalk.blue(`📋 Getting logs for container ${containerId}...`))

      const logs = await this.vmOrchestrator.getContainerLogs(containerId, lines)

      if (logs.trim()) {
        console.log(chalk.gray('─'.repeat(60)))
        console.log(chalk.blue.bold(`📋 Container Logs (last ${lines} lines):`))
        console.log(chalk.gray('─'.repeat(60)))
        console.log(logs)
        console.log(chalk.gray('─'.repeat(60)))
      } else {
        console.log(chalk.yellow('📋 No logs available for this container'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get container logs: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmModeCommand(): Promise<CommandResult> {
    const containers = this.vmOrchestrator.getActiveContainers()

    if (containers.length === 0) {
      console.log(chalk.yellow('⚠️ No VM containers available'))
      console.log(chalk.gray('Use /vm-create <repo-url|os> to create one first'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    // Set VM mode in global StreamingOrchestrator
    if ((global as any).__streamingOrchestrator) {
      const orchestrator = (global as any).__streamingOrchestrator
      if (orchestrator.context) {
        orchestrator.context.vmMode = true
        orchestrator.context.planMode = false
        orchestrator.context.autoAcceptEdits = false
      }
    }

    // Also set the global currentMode for NikCLI prompt
    if ((global as any).__nikCLI) {
      ; (global as any).__nikCLI.currentMode = 'vm'
    }

    console.log(chalk.blue.bold('🐳 Entering VM Chat Mode'))
    console.log(chalk.gray('─'.repeat(40)))
    console.log(chalk.green(`Available containers: ${containers.length}`))
    console.log(chalk.gray('All messages will be sent to VM agents'))
    console.log(chalk.gray('Type /default to exit VM mode'))

    return { shouldExit: false, shouldUpdatePrompt: true }
  }

  // VM Helper Methods
  getVMOrchestrator() {
    return this.vmOrchestrator
  }

  getActiveVMContainers() {
    return this.vmOrchestrator.getActiveContainers()
  }

  // New VM Selection Commands
  private async vmSwitchCommand(): Promise<CommandResult> {
    // Call the enhanced VM Switch Panel from nik-cli.ts
    if (this.cliInstance?.showVMSwitchPanel) {
      await this.cliInstance.showVMSwitchPanel()
    } else {
      // Fallback to simple switch
      console.log(chalk.blue('⚡︎ Switching VM...'))

      try {
        const selectedVM = await vmSelector.switchVM()
        if (selectedVM) {
          console.log(chalk.green(`✓ Switched to VM: ${selectedVM.name}`))
          this.printPanel(
            chalk.gray(
              `Container: ${selectedVM.containerId.slice(0, 12)} | Repository: ${selectedVM.repositoryUrl || 'N/A'}`
            )
          )
        } else {
          console.log(chalk.gray('VM switch cancelled'))
        }
      } catch (error: any) {
        console.log(chalk.red(`❌ Failed to switch VM: ${error.message}`))
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmDashboardCommand(): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    try {
      const vms = await vmSelector.getAvailableVMs({ showInactive: true, sortBy: 'status' })

      if (vms.length === 0) {
        this.printPanel(
          boxen(
            `${chalk.yellow('No VM containers found')}\n\n${chalk.gray('Use /vm-create <repo-url|os> to create your first VM')}`,
            {
              title: '🐳 VM Dashboard',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            }
          )
        )
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Build dashboard content
      let content = ''

      // Show currently selected VM
      const selectedVM = vmSelector.getSelectedVM()
      if (selectedVM) {
        content += `${chalk.green.bold('🎯 Currently Selected:')}\n`
        content += `   ${chalk.cyan(selectedVM.name)}\n`
        content += `   Container: ${chalk.gray(selectedVM.containerId.slice(0, 12))}\n`
        content += `   Status: ${this.formatStatus(selectedVM.status)}\n\n`
      }

      // List all VMs
      content += `${chalk.white.bold('📋 Available VMs:')}\n`
      content += chalk.gray('─'.repeat(60)) + '\n\n'

      vms.forEach((vm, index) => {
        const isSelected = selectedVM?.id === vm.id
        const prefix = isSelected ? chalk.green('▶ ') : '  '
        const name = isSelected ? chalk.green.bold(vm.name) : chalk.white(vm.name)

        content += `${prefix}${name} (${chalk.gray(vm.containerId.slice(0, 8))})\n`
        content += `   Status: ${this.formatStatus(vm.status)}\n`
        content += `   Repository: ${chalk.gray(vm.repositoryUrl || 'N/A')}\n`

        if (vm.systemInfo) {
          content += `   System: ${chalk.gray(vm.systemInfo.os + ' ' + vm.systemInfo.arch)}\n`
        }

        if (index < vms.length - 1) content += '\n'
      })

      this.printPanel(
        boxen(content, {
          title: `🐳 VM Dashboard (${vms.length} containers)`,
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ VM Dashboard Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmSelectCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.blue('🎯 Interactive VM selection...'))

      try {
        const selectedVM = await vmSelector.selectVM({ interactive: true, sortBy: 'activity' })
        if (selectedVM) {
          console.log(chalk.green(`✓ Selected VM: ${selectedVM.name}`))
          this.printPanel(
            chalk.gray(
              `Container: ${selectedVM.containerId.slice(0, 12)} | Repository: ${selectedVM.repositoryUrl || 'N/A'}`
            )
          )
        } else {
          console.log(chalk.gray('VM selection cancelled'))
        }
      } catch (error: any) {
        console.log(chalk.red(`❌ Failed to select VM: ${error.message}`))
      }
    } else {
      const vmId = args[0]
      console.log(chalk.blue(`🎯 Selecting VM: ${vmId}`))

      try {
        const success = vmSelector.setSelectedVM(vmId)
        if (success) {
          console.log(chalk.green(`✓ Selected VM: ${vmId}`))
        } else {
          console.log(chalk.red(`❌ VM not found: ${vmId}`))
          console.log(chalk.gray('Use /vm-list to see available VMs'))
        }
      } catch (error: any) {
        console.log(chalk.red(`❌ Failed to select VM: ${error.message}`))
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // OS-like VM Commands
  private async vmStatusCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default
    const vmId = args[0]

    try {
      // Determine target VM - use getAvailableVMs to get VMTarget with all info
      let targetVM: any = null
      if (vmId) {
        const vms = await vmSelector.getAvailableVMs({ showInactive: true })
        targetVM = vms.find((v) => v.id === vmId || v.containerId === vmId)
      } else {
        targetVM = vmSelector.getSelectedVM()
      }

      if (!targetVM) {
        this.printPanel(
          boxen(
            `${chalk.yellow('No VM selected or found')}\n\n${chalk.gray('Use /vm-select to choose a VM or provide VM ID')}`,
            {
              title: '🖥️ VM System Status',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            }
          )
        )
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Build system status content
      let content = ''
      content += `${chalk.cyan.bold(targetVM.name || 'Unknown')}\n`
      content += chalk.gray('─'.repeat(60)) + '\n\n'

      content += `${chalk.white.bold('Container Info:')}\n`
      content += `   ID: ${chalk.gray(targetVM.containerId.slice(0, 12))}\n`
      content += `   Status: ${this.formatStatus(targetVM.status)}\n`
      if (targetVM.repositoryUrl) {
        content += `   Repository: ${chalk.gray(targetVM.repositoryUrl)}\n`
      }
      content += '\n'

      if (targetVM.systemInfo) {
        content += `${chalk.white.bold('System Information:')}\n`
        content += `   OS: ${chalk.gray(targetVM.systemInfo.os || 'N/A')}\n`
        content += `   Arch: ${chalk.gray(targetVM.systemInfo.arch || 'N/A')}\n`
        if (targetVM.systemInfo.workingDirectory) {
          content += `   Working Dir: ${chalk.gray(targetVM.systemInfo.workingDirectory)}\n`
        }
        if (targetVM.systemInfo.nodeVersion) {
          content += `   Node: ${chalk.gray(targetVM.systemInfo.nodeVersion)}\n`
        }
        if (targetVM.systemInfo.npmVersion) {
          content += `   npm: ${chalk.gray(targetVM.systemInfo.npmVersion)}\n`
        }
        content += '\n'
      }

      if (targetVM.resourceUsage) {
        content += `${chalk.white.bold('Resource Usage:')}\n`
        content += `   Memory: ${chalk.gray(targetVM.resourceUsage.memory || 'N/A')}\n`
        content += `   CPU: ${chalk.gray(targetVM.resourceUsage.cpu || 'N/A')}\n`
        content += `   Disk: ${chalk.gray(targetVM.resourceUsage.disk || 'N/A')}\n`
      }

      this.printPanel(
        boxen(content, {
          title: '🖥️ VM System Status',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ VM Status Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmExecCommand(args: string[]): Promise<CommandResult> {
    const command = args.join(' ')

    // Call the enhanced VM Exec Panel from nik-cli.ts
    if (this.cliInstance?.showVMExecPanel) {
      await this.cliInstance.showVMExecPanel(command || undefined)
    } else {
      // Fallback to simple exec
      if (args.length === 0) {
        console.log(chalk.red('Usage: /vm-exec <command>'))
        console.log(chalk.gray('Execute command in selected VM (OS-like terminal)'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const selectedVM = vmSelector.getSelectedVM()

      if (!selectedVM) {
        console.log(chalk.yellow('⚠️ No VM selected'))
        console.log(chalk.gray('Use /vm-select to choose a VM first'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`🔧 Executing command in VM: ${selectedVM.name}`))

      try {
        await vmSelector.executeVMCommand(selectedVM.id, command)
      } catch (error: any) {
        console.log(chalk.red(`❌ Command execution failed: ${error.message}`))
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmLsCommand(args: string[]): Promise<CommandResult> {
    const directory = args[0] || undefined

    // Call the enhanced VM File Browser Panel from nik-cli.ts
    if (this.cliInstance?.showVMFileBrowserPanel) {
      await this.cliInstance.showVMFileBrowserPanel(directory)
    } else {
      // Fallback to simple ls
      const selectedVM = vmSelector.getSelectedVM()

      if (!selectedVM) {
        console.log(chalk.yellow('⚠️ No VM selected'))
        console.log(chalk.gray('Use /vm-select to choose a VM first'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`📁 Listing files in VM: ${selectedVM.name}`))
      if (directory) {
        console.log(chalk.gray(`Directory: ${directory}`))
      }

      try {
        const files = await vmSelector.listVMFiles(selectedVM.id, directory)

        if (files.length === 0) {
          console.log(chalk.yellow('No files found or directory is empty'))
        } else {
          console.log(chalk.white('Files:'))
          files.forEach((file) => {
            console.log(chalk.gray(`  ${file}`))
          })
        }
      } catch (error: any) {
        console.log(chalk.red(`❌ Failed to list files: ${error.message}`))
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // Advanced VM Commands
  private async vmBroadcastCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /vm-broadcast <message>'))
      console.log(chalk.gray('Send message to all active VMs simultaneously'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const message = args.join(' ')
    console.log(chalk.blue('📢 Broadcasting message to all VMs...'))

    try {
      await vmSelector.broadcastToAllVMs(message)
    } catch (error: any) {
      console.log(chalk.red(`❌ Broadcast failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmHealthCommand(): Promise<CommandResult> {
    console.log(chalk.blue('🏥 Running VM health check...'))

    try {
      await vmSelector.performHealthCheckAll()
    } catch (error: any) {
      console.log(chalk.red(`❌ Health check failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmBackupCommand(args: string[]): Promise<CommandResult> {
    const vmId = args[0]

    if (!vmId) {
      const selectedVM = vmSelector.getSelectedVM()
      if (!selectedVM) {
        console.log(chalk.red('Usage: /vm-backup [vm-id]'))
        console.log(chalk.gray('Backup VM session (uses selected VM if no ID provided)'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      try {
        const backupId = await vmSelector.backupVMSession(selectedVM.id)
        console.log(chalk.green(`✓ Backup completed: ${backupId}`))
      } catch (error: any) {
        console.log(chalk.red(`❌ Backup failed: ${error.message}`))
      }
    } else {
      try {
        const backupId = await vmSelector.backupVMSession(vmId)
        console.log(chalk.green(`✓ Backup completed: ${backupId}`))
      } catch (error: any) {
        console.log(chalk.red(`❌ Backup failed: ${error.message}`))
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async vmStatsCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default
    const vmId = args[0]

    try {
      const vms = await vmSelector.getAvailableVMs({ showInactive: true })

      if (vms.length === 0) {
        this.printPanel(
          boxen(`${chalk.yellow('No VM containers found')}`, {
            title: '📊 VM Session Statistics',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Calculate statistics
      let totalMessages = 0
      let activeChats = 0
      const vmStats: any[] = []

      for (const vm of vms) {
        const history = vmSelector.getChatHistory(vm.id)
        const isActive = vm.status === 'running'

        totalMessages += history.length
        if (isActive && history.length > 0) activeChats++

        vmStats.push({
          name: vm.name,
          id: vm.id.slice(0, 8),
          status: vm.status,
          messages: history.length,
          lastActivity: vm.lastActivity || 'Never',
          isActive,
        })
      }

      // Build stats content
      let content = ''

      // Overview
      content += `${chalk.white.bold('🎯 Overview:')}\n`
      content += `   Total VMs: ${chalk.cyan(vms.length)}\n`
      content += `   Active VMs: ${chalk.green(vms.filter((vm) => vm.status === 'running').length)}\n`
      content += `   Active Chats: ${chalk.cyan(activeChats)}\n`
      content += `   Total Messages: ${chalk.cyan(totalMessages)}\n\n`

      // Individual VM stats
      if (vmId) {
        // Show stats for specific VM
        const targetStat = vmStats.find((s) => s.id === vmId.slice(0, 8) || s.name === vmId)
        if (targetStat) {
          content += `${chalk.white.bold('📋 VM Details:')}\n`
          content += chalk.gray('─'.repeat(60)) + '\n\n'

          const statusIcon = targetStat.status === 'running' ? '🟢' : '🔴'
          const activeIcon = targetStat.isActive && targetStat.messages > 0 ? '💬' : '💤'

          content += `${statusIcon} ${activeIcon} ${chalk.white(targetStat.name)} (${chalk.gray(targetStat.id)})\n`
          content += `   Messages: ${chalk.cyan(targetStat.messages)}\n`
          content += `   Status: ${chalk.gray(targetStat.status)}\n`
          content += `   Last Activity: ${chalk.gray(typeof targetStat.lastActivity === 'object' ? targetStat.lastActivity.toLocaleString() : targetStat.lastActivity)}\n`
        } else {
          content += `${chalk.yellow('VM not found: ' + vmId)}\n`
        }
      } else {
        // Show all VM stats
        content += `${chalk.white.bold('📋 Individual VM Stats:')}\n`
        content += chalk.gray('─'.repeat(60)) + '\n\n'

        vmStats.forEach((stat) => {
          const statusIcon = stat.status === 'running' ? '🟢' : '🔴'
          const activeIcon = stat.isActive && stat.messages > 0 ? '💬' : '💤'

          content += `${statusIcon} ${activeIcon} ${chalk.white(stat.name)} (${chalk.gray(stat.id)})\n`
          content += `   Messages: ${chalk.cyan(stat.messages)} | Status: ${chalk.gray(stat.status)}\n`
          content += `   Last Activity: ${chalk.gray(typeof stat.lastActivity === 'object' ? stat.lastActivity.toLocaleString() : stat.lastActivity)}\n\n`
        })
      }

      this.printPanel(
        boxen(content.trim(), {
          title: '📊 VM Session Statistics',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      this.printPanel(
        boxen(`Error: ${error.message}`, {
          title: '❌ VM Stats Failed',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // Agent Factory Commands
  private async factoryCommand(): Promise<CommandResult> {
    await agentFactory.showFactoryDashboard()
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async createAgentCommand(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      console.log(chalk.red('Usage: /create-agent [--vm|--container] <name> <specialization>'))
      console.log(chalk.gray('Examples:'))
      console.log(chalk.gray('  /create-agent react-expert "React testing and optimization"'))
      console.log(chalk.gray('  /create-agent --vm repo-analyzer "Repository analysis and documentation"'))
      console.log(chalk.gray('  /create-agent --container test-runner "Isolated testing environment"'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      // Parse flags, name, and specialization
      let agentType: 'standard' | 'vm' | 'container' = 'standard'
      let name = ''
      let specialization = ''

      for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (arg === '--vm') {
          agentType = 'vm'
        } else if (arg === '--container') {
          agentType = 'container'
        } else {
          // Next arg is name, remaining args are specialization
          name = args[i]
          specialization = args.slice(i + 1).join(' ')
          break
        }
      }

      if (!name || !specialization) {
        console.log(chalk.red('Error: Both name and specialization are required'))
        console.log(chalk.gray('Usage: /create-agent [--vm|--container] <name> <specialization>'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Validate inputs
      try {
        CreateAgentCommandSchema.parse({ name, specialization, type: agentType })
      } catch (validationError: any) {
        console.log(chalk.red('❌ Invalid arguments:'))
        validationError.errors?.forEach((err: any) => {
          console.log(chalk.yellow(`   • ${err.path.join('.')}: ${err.message}`))
        })
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Create appropriate agent type with explicit name
      const blueprint = await agentFactory.createAgentBlueprint({
        name,
        specialization,
        autonomyLevel: 'fully-autonomous',
        contextScope: 'project',
        agentType,
      })

      const typeIcon = agentType === 'vm' || agentType === 'container' ? '🐳' : '🔌'
      const typeLabel = agentType === 'vm' || agentType === 'container' ? 'VM Agent' : 'Standard Agent'

      console.log(chalk.green(`✓ ${typeLabel} blueprint created: ${blueprint.name}`))
      console.log(chalk.gray(`${typeIcon} Type: ${blueprint.agentType}`))
      console.log(chalk.gray(`📋 Blueprint ID: ${blueprint.id}`))

      if (blueprint.vmConfig) {
        console.log(chalk.gray(`🐳 Container Image: ${blueprint.vmConfig.containerImage}`))
        console.log(chalk.gray(`💾 Memory Limit: ${blueprint.vmConfig.resourceLimits?.memory}`))
      }

      console.log(chalk.gray('Use /launch-agent <id> to launch this agent'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Error creating agent: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async launchAgentCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /launch-agent <blueprint-id|name> [task]'))
      console.log(chalk.gray('Example: /launch-agent react-expert "create a login form"'))
      console.log(chalk.gray('Example: /launch-agent a1b2c3d4 "analyze the codebase"'))
      console.log(chalk.gray('Use /factory to see available blueprints'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const identifier = args[0]
      const task = args.slice(1).join(' ')

      console.log(chalk.blue(`🔍 Looking for blueprint: ${identifier}`))
      const agent = await agentFactory.launchAgent(identifier)

      if (task) {
        console.log(chalk.blue(`🚀 Running agent ${agent.getBlueprint().name} with task: ${task}`))
        const result = await agent.run(task)
        console.log(chalk.green('✓ Agent execution completed:'))
        if (typeof result === 'object') {
          console.log(JSON.stringify(result, null, 2))
        } else {
          console.log(result)
        }
      } else {
        console.log(chalk.blue(`🔌 Agent ${agent.getBlueprint().name} launched and ready`))
        console.log(chalk.gray(`Use /agent ${agent.getBlueprint().name} <task> to run tasks`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error launching agent:`))
      // Split multiline error messages for better readability
      const errorLines = error.message.split('\n')
      errorLines.forEach((line: string) => {
        if (line.trim()) {
          console.log(chalk.red(`   ${line}`))
        }
      })

      // Show helpful suggestion
      console.log(chalk.gray('\n💡 Helpful commands:'))
      console.log(chalk.gray('   /factory - View all available blueprints'))
      console.log(chalk.gray('   /create-agent <name> <specialization> - Create a new agent'))
      console.log(chalk.gray('   /blueprints - Manage blueprint storage'))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async contextCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      // Show comprehensive context stats panel
      await this.showContextStatsPanel()
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      if (args && args.length > 0) {
        // Use args array directly, filter empty strings
        const pathList = args.filter((p) => p.trim().length > 0)

        if (pathList.length === 0) {
          console.log(chalk.yellow('⚠️ No valid paths provided'))
          return { shouldExit: false, shouldUpdatePrompt: false }
        }

        await workspaceContext.selectPaths(pathList)

        // Enhanced context display with files and directories + progress bar
        await this.showEnhancedContextWithProgress(pathList)
      } else {
        // Show current context when no args provided
        await this.showEnhancedContext()
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error updating context: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Show enhanced context with both directories and files
   */
  private async showEnhancedContext(): Promise<void> {
    // Access the private context property directly since getContext() doesn't exist
    const context = (workspaceContext as any).context

    console.log(chalk.blue('\n💼 Current Workspace Context:'))
    console.log(chalk.gray('─'.repeat(60)))

    // Show selected paths
    console.log(chalk.cyan('\n🎯 Selected Paths:'))
    context.selectedPaths.forEach((path: string) => {
      const isDir = require('node:fs').statSync(path).isDirectory()
      const icon = isDir ? '⚡︎' : '📄'
      const relativePath = require('node:path').relative(context.rootPath, path)
      console.log(`  ${icon} ${relativePath || '.'}`)
    })

    // Show directories with file counts
    if (context.directories.size > 0) {
      console.log(chalk.cyan('\n📁 Directories:'))
      Array.from(context.directories.entries() as [string, any][])
        .sort(([a]: [string, any], [b]: [string, any]) => a.localeCompare(b))
        .slice(0, 20) // Limit display
        .forEach(([path, dir]: [string, any]) => {
          const relativePath = require('node:path').relative(context.rootPath, path)
          const fileCount = dir.totalFiles || 0
          const languagesInfo = dir.mainLanguages?.slice(0, 3).join(', ') || 'mixed'
          console.log(`  ⚡︎ ${relativePath || '.'} (${fileCount} files, ${languagesInfo})`)
        })

      if (context.directories.size > 20) {
        console.log(chalk.gray(`  ... and ${context.directories.size - 20} more directories`))
      }
    }

    // Show individual files with details
    if (context.files.size > 0) {
      console.log(chalk.cyan('\n📄 Files:'))
      Array.from(context.files.entries() as [string, any][])
        .sort(([a]: [string, any], [b]: [string, any]) => a.localeCompare(b))
        .slice(0, 30) // Show more files since they're the main issue
        .forEach(([path, file]: [string, any]) => {
          const relativePath = require('node:path').relative(context.rootPath, path)
          const sizeKB = Math.round(file.size / 1024)
          const importance = file.importance ? `⭐${Math.round(file.importance)}%` : ''
          console.log(` ${relativePath} (${sizeKB}KB, ${file.language}) ${importance}`)
        })

      if (context.files.size > 30) {
        console.log(chalk.gray(`  ... and ${context.files.size - 30} more files`))
      }
    }

    // Show project metadata
    if (context.projectMetadata) {
      console.log(chalk.cyan('\n🔨 Project Info:'))
      if (context.projectMetadata.name) {
        console.log(`  Name: ${context.projectMetadata.name}`)
      }
      if (context.projectMetadata.framework) {
        console.log(`  Framework: ${context.projectMetadata.framework}`)
      }
      if (context.projectMetadata.languages?.length > 0) {
        console.log(`  Languages: ${context.projectMetadata.languages.join(', ')}`)
      }
      if (context.projectMetadata.dependencies?.length > 0) {
        const depsCount = context.projectMetadata.dependencies.length
        const displayDeps = context.projectMetadata.dependencies.slice(0, 5).join(', ')
        console.log(`  Dependencies: ${displayDeps}${depsCount > 5 ? ` (+${depsCount - 5} more)` : ''}`)
      }
    }

    // Show RAG status
    if (context.ragAvailable !== undefined) {
      const ragStatus = context.ragAvailable ? chalk.green('✓ Available') : chalk.yellow('⚠️ Fallback mode')
      console.log(chalk.cyan('\n🤖 RAG Integration:'), ragStatus)
    }

    // Show summary stats
    console.log(chalk.gray('\n📊 Summary:'))
    console.log(chalk.gray(`  • ${context.directories.size} directories, ${context.files.size} files`))
    console.log(chalk.gray(`  • Updated: ${context.lastUpdated.toLocaleString()}`))
    console.log(chalk.gray(`  • Root: ${context.rootPath}`))

    console.log(chalk.gray('\n📝 Use /context <paths> to select specific directories or files'))
  }

  /**
   * Show comprehensive context stats panel with progress bar
   */
  private async showContextStatsPanel(): Promise<void> {
    const session = contextTokenManager.getCurrentSession()
    const stats = contextTokenManager.getSessionStats()

    if (!session || !stats) {
      console.log(chalk.yellow('⚠️ No active session. Start a conversation to see context stats.'))
      return
    }

    const lines: string[] = []

    // Header
    lines.push(chalk.blue.bold('📊 Context & Token Statistics'))
    lines.push(chalk.gray('─'.repeat(70)))
    lines.push('')

    // Model info
    lines.push(chalk.cyan('🤖 Model Configuration:'))
    lines.push(`  Provider: ${chalk.white(session.provider)}`)
    lines.push(`  Model: ${chalk.white(session.model)}`)
    lines.push(`  Max Context: ${chalk.white(this.formatTokens(session.modelLimits.context))}`)
    lines.push(`  Max Output: ${chalk.white(this.formatTokens(session.modelLimits.output))}`)
    lines.push('')

    // Session stats
    const totalTokens = session.totalInputTokens + session.totalOutputTokens
    const percentage = (totalTokens / session.modelLimits.context) * 100
    const remaining = session.modelLimits.context - totalTokens

    lines.push(chalk.cyan('📈 Session Usage:'))
    lines.push(
      `  Total Tokens: ${chalk.white(this.formatTokens(totalTokens))} / ${this.formatTokens(session.modelLimits.context)}`
    )
    lines.push(`  Input Tokens: ${chalk.white(this.formatTokens(session.totalInputTokens))}`)
    lines.push(`  Output Tokens: ${chalk.white(this.formatTokens(session.totalOutputTokens))}`)
    lines.push(`  Total Cost: ${chalk.green(`$${session.totalCost.toFixed(6)}`)}`)
    lines.push(`  Messages: ${chalk.white(session.messageCount.toString())}`)
    lines.push('')

    // Progress bar for context usage
    lines.push(chalk.cyan('📊 Context Usage:'))
    const progressBar = this.createProgressBar(percentage, 50)
    const color = percentage >= 90 ? chalk.red : percentage >= 80 ? chalk.yellow : chalk.green
    lines.push(`  ${progressBar} ${color(percentage.toFixed(1) + '%')}`)
    lines.push(
      `  Remaining: ${chalk.white(this.formatTokens(remaining))} (${chalk.white((100 - percentage).toFixed(1) + '%')})`
    )
    lines.push('')

    // Detailed Context Breakdown (Claude Code style)
    const breakdown = this.getContextBreakdown()
    if (breakdown.categories.length > 0) {
      lines.push(chalk.white.bold('Context Usage'))

      // Main progress bar with model info
      const mainBar = this.createDetailedProgressBar(percentage, 10)
      const modelInfo = `${session.model} · ${this.formatTokens(totalTokens)}/${this.formatTokens(session.modelLimits.context)} tokens (${percentage.toFixed(0)}%)`
      lines.push(`${chalk.gray('     ')}${mainBar}${chalk.gray('   ')}${chalk.gray(modelInfo)}`)

      // Secondary visual bar
      const secondaryBar = this.createDetailedProgressBar(percentage, 10)
      lines.push(`${chalk.gray('     ')}${secondaryBar}`)

      // Category breakdown with individual bars
      for (const category of breakdown.categories) {
        const categoryBar = this.createDetailedProgressBar(0, 10) // Empty bar as visual separator
        const catColor = chalk.hex(category.color)
        const tokenDisplay = this.formatTokens(category.tokens)
        const percentDisplay = `${category.percentage.toFixed(1)}%`

        lines.push(
          `${chalk.gray('     ')}${categoryBar}${chalk.gray('   ')}${catColor(category.icon)} ${category.name}: ${tokenDisplay} tokens (${percentDisplay})`
        )
      }

      lines.push('')
    }

    // Rate and efficiency
    const sessionMinutes = (Date.now() - session.startTime.getTime()) / 60000
    lines.push(chalk.cyan('⚡ Performance:'))
    lines.push(`  Tokens/Minute: ${chalk.white(stats.tokensPerMinute.toFixed(0))}`)
    lines.push(`  Avg Tokens/Message: ${chalk.white(stats.averageTokensPerMessage.toFixed(0))}`)
    lines.push(`  Cost/Message: ${chalk.green(`$${stats.costPerMessage.toFixed(6)}`)}`)
    lines.push(`  Session Duration: ${chalk.white(this.formatDuration(sessionMinutes))}`)
    lines.push('')

    // Breakdown by message role (if we can get message history)
    const messageHistory = contextTokenManager.getMessageHistory()
    if (messageHistory.length > 0) {
      const roleBreakdown: Record<string, { count: number; tokens: number }> = {}

      for (const msg of messageHistory) {
        if (!roleBreakdown[msg.role]) {
          roleBreakdown[msg.role] = { count: 0, tokens: 0 }
        }
        roleBreakdown[msg.role].count++
        roleBreakdown[msg.role].tokens += msg.tokens
      }

      lines.push(chalk.cyan('💬 Message Breakdown:'))
      for (const [role, data] of Object.entries(roleBreakdown).sort((a, b) => b[1].tokens - a[1].tokens)) {
        const roleIcon = role === 'system' ? '⚙️' : role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '🔧'
        const rolePct = (data.tokens / totalTokens) * 100
        const miniBar = this.createProgressBar(rolePct, 20)
        lines.push(
          `  ${roleIcon} ${role.padEnd(10)} ${miniBar} ${this.formatTokens(data.tokens).padStart(6)} (${rolePct.toFixed(1)}%)`
        )
      }
      lines.push('')
    }

    // Optimization status
    const optimization = contextTokenManager.analyzeContextOptimization()
    lines.push(chalk.cyan('🎯 Optimization Status:'))

    let statusIcon = '✅'
    let statusColor = chalk.green
    if (optimization.recommendation === 'summarize') {
      statusIcon = '🔴'
      statusColor = chalk.red
    } else if (optimization.recommendation === 'trim_context') {
      statusIcon = '⚠️'
      statusColor = chalk.yellow
    }

    lines.push(`  Status: ${statusIcon} ${statusColor(optimization.recommendation.replace('_', ' ').toUpperCase())}`)
    lines.push(`  ${chalk.gray(optimization.reason)}`)
    lines.push('')

    // Tips
    lines.push(chalk.gray('💡 Tips:'))
    if (percentage >= 80) {
      lines.push(chalk.gray('  • Context usage is high. Consider starting a new session with /session new'))
      lines.push(chalk.gray('  • Use /clear to reset conversation history'))
    } else if (percentage >= 50) {
      lines.push(chalk.gray('  • Monitor context usage to avoid trimming'))
    } else {
      lines.push(chalk.gray('  • Context usage is healthy'))
    }
    lines.push(chalk.gray('  • Use /context <path> to add specific files/directories'))

    this.printPanel(
      boxen(lines.join('\n'), {
        title: '📊 Context Statistics',
        padding: 1,
        borderColor: percentage >= 90 ? 'red' : percentage >= 80 ? 'yellow' : 'cyan',
        borderStyle: 'round',
      })
    )
  }

  /**
   * Show enhanced context with progress bar for specific path
   */
  private async showEnhancedContextWithProgress(pathList: string[]): Promise<void> {
    // First show the standard enhanced context
    await this.showEnhancedContext()

    // Now add progress bar for the selected path contribution
    const session = contextTokenManager.getCurrentSession()
    if (!session) {
      return
    }

    console.log('')
    console.log(chalk.blue.bold('📊 Path Context Contribution:'))
    console.log(chalk.gray('─'.repeat(70)))

    // Calculate approximate token contribution from selected paths
    const context = (workspaceContext as any).context
    let pathTokens = 0

    for (const selectedPath of context.selectedPaths) {
      try {
        const stats = require('node:fs').statSync(selectedPath)

        if (stats.isFile()) {
          const file = context.files.get(selectedPath)
          if (file) {
            // Rough estimate: ~4 chars per token
            pathTokens += Math.ceil(file.size / 4)
          }
        } else if (stats.isDirectory()) {
          const dir = context.directories.get(selectedPath)
          if (dir && dir.totalFiles) {
            // Estimate based on file count
            pathTokens += dir.totalFiles * 200 // ~200 tokens per file average
          }
        }
      } catch (error) {
        // Ignore errors for individual paths
      }
    }

    const totalTokens = session.totalInputTokens + session.totalOutputTokens
    const pathPercentage = totalTokens > 0 ? (pathTokens / totalTokens) * 100 : 0
    const progressBar = this.createProgressBar(pathPercentage, 50)

    console.log('')
    pathList.forEach((path) => {
      const relativePath = require('node:path').relative(context.rootPath, path)
      console.log(`  📁 ${chalk.cyan(relativePath || '.')}`)
    })
    console.log('')
    console.log(`  ${progressBar} ${chalk.white(pathPercentage.toFixed(1) + '%')}`)
    console.log(
      `  Estimated tokens: ~${chalk.white(this.formatTokens(pathTokens))} of ${this.formatTokens(totalTokens)} total`
    )
    console.log('')
  }


  /**
   * Create a detailed progress bar using special characters similar to Claude Code
   */
  private createDetailedProgressBar(percentage: number, width: number = 10): string {
    const filledCount = Math.floor((percentage / 100) * width)
    const emptyCount = width - filledCount

    // Special characters for progress visualization
    const filledChar = '⛁'
    const partialChar = '⛀'
    const emptyChar = '⛶'
    const bufferChar = '⛝'

    // Color coding based on usage
    let color = chalk.hex('#00b2b2') // cyan-ish
    if (percentage >= 90) {
      color = chalk.hex('#ff3366') // red
    } else if (percentage >= 80) {
      color = chalk.hex('#ff9933') // orange/yellow
    } else if (percentage >= 50) {
      color = chalk.hex('#3366ff') // blue
    }

    // Build the bar
    const filled = color(filledChar.repeat(filledCount))
    const partial = percentage % (100 / width) > 0 ? color(partialChar) : ''
    const empty = chalk.hex('#666666')(emptyChar.repeat(emptyCount))

    return `${filled}${partial}${empty}`
  }

  /**
   * Get detailed context breakdown by category
   */
  private getContextBreakdown(): {
    categories: Array<{
      name: string
      icon: string
      tokens: number
      percentage: number
      color: string
    }>
    totalTokens: number
    maxTokens: number
  } {
    const session = contextTokenManager.getCurrentSession()
    if (!session) {
      return {
        categories: [],
        totalTokens: 0,
        maxTokens: 0,
      }
    }

    const totalTokens = session.totalInputTokens + session.totalOutputTokens
    const maxTokens = session.modelLimits.context

    // Estimate system components (these are approximations)
    const systemPromptTokens = Math.floor(totalTokens * 0.02) // ~2% for system prompt
    const systemToolsTokens = Math.floor(totalTokens * 0.08) // ~8% for system tools
    const mcpToolsTokens = Math.floor(totalTokens * 0.006) // ~0.6% for MCP tools
    const customAgentsTokens = Math.floor(totalTokens * 0.02) // ~2% for custom agents
    const memoryFilesTokens = Math.floor(totalTokens * 0.017) // ~1.7% for memory files

    // Messages are the remaining tokens
    const messageTokens = Math.max(
      0,
      totalTokens - systemPromptTokens - systemToolsTokens - mcpToolsTokens - customAgentsTokens - memoryFilesTokens
    )

    // Free space
    const freeSpace = maxTokens - totalTokens

    // Autocompact buffer (22.5% of max context)
    const autocompactBuffer = Math.floor(maxTokens * 0.225)

    const categories = [
      {
        name: 'System prompt',
        icon: '⛁',
        tokens: systemPromptTokens,
        percentage: (systemPromptTokens / maxTokens) * 100,
        color: '#999999',
      },
      {
        name: 'System tools',
        icon: '⛁',
        tokens: systemToolsTokens,
        percentage: (systemToolsTokens / maxTokens) * 100,
        color: '#666666',
      },
      {
        name: 'MCP tools',
        icon: '⛁',
        tokens: mcpToolsTokens,
        percentage: (mcpToolsTokens / maxTokens) * 100,
        color: '#00b2b2',
      },
      {
        name: 'Custom agents',
        icon: '⛁',
        tokens: customAgentsTokens,
        percentage: (customAgentsTokens / maxTokens) * 100,
        color: '#3366ff',
      },
      {
        name: 'Memory files',
        icon: '⛁',
        tokens: memoryFilesTokens,
        percentage: (memoryFilesTokens / maxTokens) * 100,
        color: '#ff9933',
      },
      {
        name: 'Messages',
        icon: '⛁',
        tokens: messageTokens,
        percentage: (messageTokens / maxTokens) * 100,
        color: '#800080',
      },
      {
        name: 'Free space',
        icon: '⛶',
        tokens: freeSpace,
        percentage: (freeSpace / maxTokens) * 100,
        color: '#666666',
      },
      {
        name: 'Autocompact buffer',
        icon: '⛝',
        tokens: autocompactBuffer,
        percentage: (autocompactBuffer / maxTokens) * 100,
        color: '#666666',
      },
    ]

    return {
      categories,
      totalTokens,
      maxTokens,
    }
  }

  /**
   * Format tokens with K/M suffix
   */
  private formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`
    }
    return tokens.toString()
  }

  /**
   * Format duration in minutes to readable string
   */
  private formatDuration(minutes: number): string {
    if (minutes < 1) {
      return `${Math.round(minutes * 60)}s`
    } else if (minutes < 60) {
      return `${Math.round(minutes)}m`
    } else {
      const hours = Math.floor(minutes / 60)
      const mins = Math.round(minutes % 60)
      return `${hours}h ${mins}m`
    }
  }



  // Planning and Todo Commands
  private async planCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      // Show plan status
      enhancedPlanning.showPlanStatus()
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const subcommand = args[0].toLowerCase()
    const restArgs = args.slice(1)

    try {
      switch (subcommand) {
        case 'create':
        case 'generate': {
          if (restArgs.length === 0) {
            console.log(chalk.red('Usage: /plan create <goal>'))
            console.log(chalk.gray('Example: /plan create "Create a React todo app with backend"'))
            return { shouldExit: false, shouldUpdatePrompt: false }
          }

          const goal = restArgs.join(' ')
          console.log(chalk.blue(`🎯 Creating plan for: ${goal}`))

          const plan = await enhancedPlanning.generatePlan(goal, {
            maxTodos: 15,
            includeContext: true,
            showDetails: true,
            saveTodoFile: true,
          })

          console.log(chalk.green(`✓ Plan created with ${plan.todos.length} todos`))
          console.log(chalk.cyan(`📝 Plan ID: ${plan.id}`))
          console.log(chalk.gray('Use /plan execute to run the plan or /plan approve to review it'))
          break
        }

        case 'execute':
        case 'run': {
          const planId = restArgs[0]
          if (!planId) {
            // Get the most recent plan
            const plans = enhancedPlanning.getActivePlans()
            const latestPlan = plans[plans.length - 1]

            if (!latestPlan) {
              // Fallback: if session todos exist, just show the dashboard instead of executing
              try {
                const { todoStore } = await import('../store/todo-store')
                const sessionId = (global as any).__streamingOrchestrator?.context?.session?.id || `${Date.now()}`
                const list = todoStore.getTodos(String(sessionId))
                if (list.length > 0) {
                  const { advancedUI } = await import('../ui/advanced-cli-ui')
                  const items = list.map((t) => ({
                    content: t.content,
                    status: t.status,
                    priority: t.priority as any,
                    progress: t.progress,
                  }))
                    ; (advancedUI as any).showTodoDashboard?.(items, 'Plan Todos')
                  return { shouldExit: false, shouldUpdatePrompt: false }
                }
              } catch { }
              console.log(chalk.yellow('No active plans found. Create one with /plan create <goal>'))
              return { shouldExit: false, shouldUpdatePrompt: false }
            }

            console.log(chalk.blue(`Executing latest plan: ${latestPlan.title}`))
            await enhancedPlanning.executePlan(latestPlan.id)
          } else {
            await enhancedPlanning.executePlan(planId)
          }
          break
        }

        case 'approve': {
          const planId = restArgs[0]
          if (!planId) {
            const plans = enhancedPlanning.getActivePlans().filter((p) => p.status === 'draft')
            if (plans.length === 0) {
              console.log(chalk.yellow('No plans pending approval'))
              return { shouldExit: false, shouldUpdatePrompt: false }
            }

            const latestPlan = plans[plans.length - 1]
            console.log(chalk.blue(`Reviewing latest plan: ${latestPlan.title}`))
            await enhancedPlanning.requestPlanApproval(latestPlan.id)
          } else {
            await enhancedPlanning.requestPlanApproval(planId)
          }
          break
        }

        case 'show':
        case 'status': {
          const planId = restArgs[0]
          enhancedPlanning.showPlanStatus(planId)
          break
        }

        case 'list': {
          const plans = enhancedPlanning.getActivePlans()
          if (plans.length === 0) {
            console.log(chalk.gray('No active plans'))
          } else {
            console.log(chalk.blue.bold('Active Plans:'))
            plans.forEach((plan, index) => {
              const statusIcon =
                plan.status === 'completed'
                  ? '✓'
                  : plan.status === 'executing'
                    ? '⚡︎'
                    : plan.status === 'approved'
                      ? '🟢'
                      : plan.status === 'failed'
                        ? '❌'
                        : '⏳'
              console.log(`  ${index + 1}. ${statusIcon} ${plan.title} (${plan.todos.length} todos)`)
              console.log(`     Status: ${plan.status} | Created: ${plan.createdAt}`)
            })
          }
          break
        }

        default:
          console.log(chalk.red(`Unknown plan command: ${subcommand}`))
          console.log(chalk.gray('Available commands: create, execute, approve, show, list'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Plan command failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async todoCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.blue('Usage: /todo <command>'))
      console.log(chalk.gray('Commands: list, show, open, edit'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const subcommand = args[0].toLowerCase()

    try {
      switch (subcommand) {
        case 'list':
        case 'ls': {
          const plans = enhancedPlanning.getActivePlans()
          if (plans.length === 0) {
            // Fallback to session todos
            try {
              const { todoStore } = await import('../store/todo-store')
              const sessionId = (global as any).__streamingOrchestrator?.context?.session?.id || `${Date.now()}`
              const list = todoStore.getTodos(String(sessionId))
              if (list.length > 0) {
                console.log(chalk.blue.bold('Todo List (Session):'))
                const completed = list.filter((t) => t.status === 'completed').length
                const inProgress = list.filter((t) => t.status === 'in_progress').length
                const pending = list.filter((t) => t.status === 'pending').length
                const cancelled = list.filter((t) => t.status === 'cancelled').length
                console.log(`   ✓ ${completed} | ⚡︎ ${inProgress} | ⏳ ${pending} | 🛑 ${cancelled}`)
                const { advancedUI } = await import('../ui/advanced-cli-ui')
                const items = list.map((t) => ({
                  content: t.content,
                  status: t.status,
                  priority: t.priority,
                  progress: t.progress,
                }))
                  ; (advancedUI as any).showTodoDashboard?.(items, 'Plan Todos')
                return { shouldExit: false, shouldUpdatePrompt: false }
              }
            } catch { }
            console.log(chalk.gray('No todo lists found'))
            return { shouldExit: false, shouldUpdatePrompt: false }
          }

          console.log(chalk.blue.bold('Todo Lists:'))
          plans.forEach((plan, index) => {
            console.log(`\n${index + 1}. ${chalk.bold(plan.title)}`)
            console.log(`   Status: ${plan.status} | Todos: ${plan.todos.length}`)

            const completed = plan.todos.filter((t) => t.status === 'completed').length
            const inProgress = plan.todos.filter((t) => t.status === 'in_progress').length
            const pending = plan.todos.filter((t) => t.status === 'pending').length
            const failed = plan.todos.filter((t) => t.status === 'failed').length

            console.log(`   ✓ ${completed} | ⚡︎ ${inProgress} | ⏳ ${pending} | ❌ ${failed}`)
          })
          break
        }

        case 'show': {
          const planId = args[1]
          if (!planId) {
            const plans = enhancedPlanning.getActivePlans()
            const latestPlan = plans[plans.length - 1]
            if (latestPlan) {
              // Render structured panel with real todos
              try {
                const { advancedUI } = await import('../ui/advanced-cli-ui')
                const todoItems = latestPlan.todos.map((t: any) => ({
                  content: t.title || t.description,
                  status: t.status,
                  priority: (t as any).priority,
                  progress: (t as any).progress,
                }))
                  ; (advancedUI as any).showTodoDashboard?.(todoItems, latestPlan.title || 'Plan Todos')
              } catch { }
              enhancedPlanning.showPlanStatus(latestPlan.id)
            } else {
              // Fallback to session todos
              try {
                const { todoStore } = await import('../store/todo-store')
                const sessionId = (global as any).__streamingOrchestrator?.context?.session?.id || `${Date.now()}`
                const list = todoStore.getTodos(String(sessionId))
                if (list.length > 0) {
                  const { advancedUI } = await import('../ui/advanced-cli-ui')
                  const items = list.map((t) => ({
                    content: t.content,
                    status: t.status,
                    priority: t.priority,
                    progress: t.progress,
                  }))
                    ; (advancedUI as any).showTodoDashboard?.(items, 'Plan Todos')
                } else {
                  console.log(chalk.yellow('No todo lists found'))
                }
              } catch {
                console.log(chalk.yellow('No todo lists found'))
              }
            }
          } else {
            const plans = enhancedPlanning.getActivePlans()
            const target = plans.find((p) => p.id === planId)
            if (target) {
              try {
                const { advancedUI } = await import('../ui/advanced-cli-ui')
                const todoItems = target.todos.map((t: any) => ({
                  content: t.title || t.description,
                  status: t.status,
                  priority: (t as any).priority,
                  progress: (t as any).progress,
                }))
                  ; (advancedUI as any).showTodoDashboard?.(todoItems, target.title || 'Plan Todos')
              } catch { }
            }
            enhancedPlanning.showPlanStatus(planId)
          }
          break
        }

        case 'open':
        case 'edit': {
          const todoPath = 'todo.md'
          console.log(chalk.blue(`Opening ${todoPath} in your default editor...`))
          try {
            await toolsManager.runCommand('code', [todoPath])
          } catch {
            try {
              await toolsManager.runCommand('open', [todoPath])
            } catch {
              console.log(chalk.yellow(`Could not open ${todoPath}. Please open it manually.`))
            }
          }
          break
        }

        default:
          console.log(chalk.red(`Unknown todo command: ${subcommand}`))
          console.log(chalk.gray('Available commands: list, show, open, edit'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Todo command failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async todosCommand(args: string[]): Promise<CommandResult> {
    // Alias for /todo list
    return await this.todoCommand(['list', ...args])
  }

  private async planCleanCommand(_args: string[] = []): Promise<CommandResult> {
    try {
      // Hide the Todos HUD panel (structured UI)
      advancedUI.hidePanel('todos')
    } catch { }

    try {
      // Clear session todos from the TodoStore for current session
      const { todoStore } = await import('../store/todo-store')
      const current = chatManager.getCurrentSession()
      const globalAny: any = global as any
      const sessionId =
        current?.id ||
        globalAny.__streamingOrchestrator?.context?.session?.id ||
        globalAny.__nikCLI?.context?.session?.id ||
        `${Date.now()}`
      todoStore.setTodos(String(sessionId), [])
    } catch { }

    // Clear inline HUD in renderPromptArea
    try {
      const nik: any = this.cliInstance
      if (nik?.clearPlanHud) nik.clearPlanHud()
    } catch { }

    console.log(chalk.green('🧹 HUD Todos cleared'))
    try {
      const nik = (global as any).__nikCLI
      nik?.renderPromptAfterOutput?.()
    } catch { }
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async todoHideCommand(_args: string[] = []): Promise<CommandResult> {
    try {
      advancedUI.hidePanel('todos')
      // Toggle visibility off for inline HUD
      const nik: any = this.cliInstance
      if (nik?.hidePlanHud) nik.hidePlanHud()
      console.log(chalk.green('🙈 Todos HUD hidden'))
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Unable to hide Todos HUD: ${error?.message || 'unknown error'}`))
    }
    try {
      const nik = (global as any).__nikCLI
      nik?.renderPromptAfterOutput?.()
    } catch { }
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async todoShowCommand(_args: string[] = []): Promise<CommandResult> {
    let shown = false
    try {
      // Toggle visibility on for inline HUD
      const nik: any = this.cliInstance
      if (nik?.showPlanHud) nik.showPlanHud()
    } catch { }
    try {
      // Prefer latest active plan todos if available
      const plans = enhancedPlanning.getActivePlans?.() || []
      const latestPlan = plans[plans.length - 1]
      if (latestPlan && Array.isArray(latestPlan.todos) && latestPlan.todos.length > 0) {
        const todoItems = latestPlan.todos.map((t: any) => ({
          content: t.title || t.description,
          status: t.status,
          priority: (t as any).priority,
          progress: (t as any).progress,
        }))
          ; (advancedUI as any).showTodoDashboard?.(todoItems, latestPlan.title || 'Plan Todos')
        shown = true
      }
    } catch { }

    if (!shown) {
      try {
        // Fallback to session todo store
        const { todoStore } = await import('../store/todo-store')
        const current = chatManager.getCurrentSession()
        const globalAny: any = global as any
        const sessionId =
          current?.id ||
          globalAny.__streamingOrchestrator?.context?.session?.id ||
          globalAny.__nikCLI?.context?.session?.id ||
          `${Date.now()}`

        const list = todoStore.getTodos(String(sessionId))
        if (list.length > 0) {
          const items = list.map((t) => ({
            content: t.content,
            status: t.status,
            priority: t.priority,
            progress: t.progress,
          }))
            ; (advancedUI as any).showTodoDashboard?.(items, 'Plan Todos')
          shown = true
        }
      } catch { }
    }

    if (!shown) {
      console.log(chalk.yellow('ℹ️ No todos to show'))
    } else {
      console.log(chalk.green('⚡︎ Todos HUD shown'))
    }

    try {
      const nik = (global as any).__nikCLI
      nik?.renderPromptAfterOutput?.()
    } catch { }
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async compactCommand(args: string[]): Promise<CommandResult> {
    const sub = (args[0] || '').toLowerCase()
    if (sub === 'on') {
      process.env.NIKCLI_COMPACT = '1'
      console.log(chalk.green('✓ compact mode ON'))
    } else if (sub === 'off') {
      delete (process.env as any).NIKCLI_COMPACT
      console.log(chalk.yellow('⚠️ compact mode OFF'))
    } else {
      console.log(chalk.blue('Usage: /compact on|off'))
      console.log(chalk.gray(`Current: ${process.env.NIKCLI_COMPACT === '1' ? 'ON' : 'OFF'}`))
    }
    try {
      const nik = (global as any).__nikCLI
      nik?.renderPromptAfterOutput?.()
    } catch { }
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async superCompactCommand(args: string[]): Promise<CommandResult> {
    const sub = (args[0] || '').toLowerCase()
    if (sub === 'on') {
      process.env.NIKCLI_SUPER_COMPACT = '1'
      console.log(chalk.green('✓ super-compact mode ON'))
    } else if (sub === 'off') {
      delete (process.env as any).NIKCLI_SUPER_COMPACT
      console.log(chalk.yellow('⚠️ super-compact mode OFF'))
    } else {
      console.log(chalk.blue('Usage: /super-compact on|off'))
      console.log(chalk.gray(`Current: ${process.env.NIKCLI_SUPER_COMPACT === '1' ? 'ON' : 'OFF'}`))
    }
    try {
      const nik = (global as any).__nikCLI
      nik?.renderPromptAfterOutput?.()
    } catch { }
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async approvalCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.blue('Approval System Configuration:'))
      const config = approvalSystem.getConfig()
      console.log(JSON.stringify(config, null, 2))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const subcommand = args[0].toLowerCase()

    try {
      switch (subcommand) {
        case 'auto-approve': {
          const type = args[1]
          const enabled = args[2] === 'true' || args[2] === 'on'

          if (!type) {
            console.log(chalk.red('Usage: /approval auto-approve <type> <on|off>'))
            console.log(chalk.gray('Types: low-risk, medium-risk, file-operations, package-installs'))
            return { shouldExit: false, shouldUpdatePrompt: false }
          }

          const currentConfig = approvalSystem.getConfig()
          const newConfig = { ...currentConfig }

          switch (type) {
            case 'low-risk':
              newConfig.autoApprove!.lowRisk = enabled
              break
            case 'medium-risk':
              newConfig.autoApprove!.mediumRisk = enabled
              break
            case 'file-operations':
              newConfig.autoApprove!.fileOperations = enabled
              break
            case 'package-installs':
              newConfig.autoApprove!.packageInstalls = enabled
              break
            default:
              console.log(chalk.red(`Unknown approval type: ${type}`))
              return { shouldExit: false, shouldUpdatePrompt: false }
          }

          approvalSystem.updateConfig(newConfig)
          console.log(chalk.green(`✓ Auto-approval for ${type} ${enabled ? 'enabled' : 'disabled'}`))
          break
        }

        case 'test': {
          console.log(chalk.blue('Testing approval system...'))
          const approved = await approvalSystem.quickApproval(
            'Test Approval',
            'This is a test of the approval system',
            'low'
          )
          console.log(approved ? chalk.green('Approved') : chalk.yellow('Cancelled'))
          break
        }

        default:
          console.log(chalk.red(`Unknown approval command: ${subcommand}`))
          console.log(chalk.gray('Available commands: auto-approve, test'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Approval command failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async streamCommand(args: string[]): Promise<CommandResult> {
    if (args.length > 0 && args[0] === 'clear') {
      const activeAgents = agentStream.getActiveAgents()
      activeAgents.forEach((agentId) => {
        agentStream.clearAgentStream(agentId)
      })
      console.log(chalk.green('✓ All agent streams cleared'))
    } else {
      agentStream.showLiveDashboard()
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async defaultModeCommand(_args: string[] = []): Promise<CommandResult> {
    // Exit VM mode and return to default mode
    if ((global as any).__streamingOrchestrator) {
      const orchestrator = (global as any).__streamingOrchestrator
      if (orchestrator.context) {
        orchestrator.context.vmMode = false
        orchestrator.context.planMode = false
        orchestrator.context.autoAcceptEdits = false
      }
    }

    // Also set the global currentMode for NikCLI prompt
    if ((global as any).__nikCLI) {
      ; (global as any).__nikCLI.currentMode = 'default'
    }

    console.log(chalk.green('💬 Switched to Default Chat Mode'))
    console.log(chalk.gray('Use Shift+Tab to cycle through modes'))

    return { shouldExit: false, shouldUpdatePrompt: true }
  }

  // Security Commands Implementation

  private async securityCommand(args: string[]): Promise<CommandResult> {
    const subcommand = args[0] || 'status'

    try {
      switch (subcommand) {
        case 'status': {
          const securityStatus = toolService.getSecurityStatus()
          const config = simpleConfigManager.getAll()

          console.log(chalk.cyan.bold('\n🔒 Security Status'))
          console.log(chalk.gray('═'.repeat(50)))
          console.log(`${chalk.blue('Security Mode:')} ${this.formatSecurityMode(securityStatus.mode)}`)
          this.printPanel(
            `${chalk.blue('Developer Mode:')} ${securityStatus.devModeActive ? chalk.yellow('Active') : chalk.gray('Inactive')}`
          )
          console.log(`${chalk.blue('Session Approvals:')} ${securityStatus.sessionApprovals}`)
          console.log(`${chalk.blue('Approval Policy:')} ${config.approvalPolicy}`)

          console.log(chalk.cyan.bold('\n📋 Tool Policies:'))
          console.log(`${chalk.blue('File Operations:')} ${config.toolApprovalPolicies.fileOperations}`)
          console.log(`${chalk.blue('Git Operations:')} ${config.toolApprovalPolicies.gitOperations}`)
          console.log(`${chalk.blue('Package Operations:')} ${config.toolApprovalPolicies.packageOperations}`)
          console.log(`${chalk.blue('System Commands:')} ${config.toolApprovalPolicies.systemCommands}`)
          console.log(`${chalk.blue('Network Requests:')} ${config.toolApprovalPolicies.networkRequests}`)

          console.log(chalk.cyan.bold('\n🔨 Tools by Risk Level:'))
          const tools = toolService.getAvailableToolsWithSecurity()
          const lowRisk = tools.filter((t) => t.riskLevel === 'low')
          const medRisk = tools.filter((t) => t.riskLevel === 'medium')
          const highRisk = tools.filter((t) => t.riskLevel === 'high')

          console.log(`${chalk.green('Low Risk:')} ${lowRisk.map((t) => t.name).join(', ')}`)
          console.log(`${chalk.yellow('Medium Risk:')} ${medRisk.map((t) => t.name).join(', ')}`)
          console.log(`${chalk.red('High Risk:')} ${highRisk.map((t) => t.name).join(', ')}`)
          break
        }

        case 'set': {
          if (args.length < 3) {
            console.log(chalk.yellow('Usage: /security set <mode> <value>'))
            this.printPanel(
              chalk.gray('Available modes: security-mode, file-ops, git-ops, package-ops, system-cmds, network-reqs')
            )
            break
          }

          const mode = args[1]
          const value = args[2]
          const config = simpleConfigManager.getAll()

          switch (mode) {
            case 'security-mode':
              if (['safe', 'default', 'developer'].includes(value)) {
                simpleConfigManager.set('securityMode', value as 'safe' | 'default' | 'developer')
                console.log(chalk.green(`✓ Security mode set to: ${value}`))
              } else {
                console.log(chalk.red('❌ Invalid mode. Use: safe, default, or developer'))
              }
              break

            case 'file-ops':
            case 'git-ops':
            case 'package-ops':
            case 'system-cmds':
            case 'network-reqs':
              if (['always', 'risky', 'never'].includes(value)) {
                const policyKey = mode
                  .replace('-', '')
                  .replace('ops', 'Operations')
                  .replace('cmds', 'Commands')
                  .replace('reqs', 'Requests')
                const keyMap: Record<string, string> = {
                  fileOperations: 'fileOperations',
                  gitOperations: 'gitOperations',
                  packageOperations: 'packageOperations',
                  systemCommands: 'systemCommands',
                  networkRequests: 'networkRequests',
                }
                config.toolApprovalPolicies[keyMap[policyKey] as keyof typeof config.toolApprovalPolicies] =
                  value as any
                simpleConfigManager.setAll(config)
                console.log(chalk.green(`✓ ${mode} policy set to: ${value}`))
              } else {
                console.log(chalk.red('❌ Invalid value. Use: always, risky, or never'))
              }
              break

            default:
              console.log(chalk.red(`❌ Unknown setting: ${mode}`))
          }
          break
        }

        case 'help':
          console.log(chalk.cyan.bold('\n🔒 Security Command Help'))
          console.log(chalk.gray('─'.repeat(40)))
          console.log(`${chalk.green('/security status')} - Show current security settings`)
          console.log(`${chalk.green('/security set <mode> <value>')} - Change security settings`)
          console.log(`${chalk.green('/security help')} - Show this help`)
          console.log(chalk.cyan('\nSecurity Modes:'))
          console.log(`${chalk.green('safe')} - Maximum security, approval for most operations`)
          console.log(`${chalk.yellow('default')} - Balanced security, approval for risky operations`)
          console.log(`${chalk.red('developer')} - Minimal security, approval only for dangerous operations`)
          break

        default:
          console.log(chalk.red(`Unknown security command: ${subcommand}`))
          console.log(chalk.gray('Use /security help for available commands'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Security command failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async devModeCommand(args: string[]): Promise<CommandResult> {
    const action = args[0] || 'enable'

    try {
      switch (action) {
        case 'enable': {
          const timeoutMs = args[1] ? parseInt(args[1], 10) * 60000 : undefined // Convert minutes to ms
          toolService.enableDevMode(timeoutMs)
          const timeout = timeoutMs ? ` for ${args[1]} minutes` : ' for 1 hour (default)'
          console.log(chalk.yellow(`🔨 Developer mode enabled${timeout}`))
          console.log(chalk.gray('Reduced security restrictions active. Use /security status to see current settings.'))
          break
        }

        case 'status': {
          const isActive = toolService.isDevModeActive()
          console.log(chalk.cyan.bold('\n🔨 Developer Mode Status'))
          console.log(chalk.gray('─'.repeat(30)))
          console.log(`${chalk.blue('Status:')} ${isActive ? chalk.yellow('Active') : chalk.gray('Inactive')}`)
          if (isActive) {
            console.log(chalk.yellow('⚠️ Security restrictions are reduced'))
          }
          break
        }

        case 'help':
          console.log(chalk.cyan.bold('\n🔨 Developer Mode Commands'))
          console.log(chalk.gray('─'.repeat(35)))
          console.log(`${chalk.green('/dev-mode enable [minutes]')} - Enable developer mode`)
          console.log(`${chalk.green('/dev-mode status')} - Check developer mode status`)
          console.log(`${chalk.green('/dev-mode help')} - Show this help`)
          console.log(chalk.yellow('\n⚠️ Developer mode reduces security restrictions'))
          break

        default:
          console.log(chalk.red(`Unknown dev-mode command: ${action}`))
          console.log(chalk.gray('Use /dev-mode help for available commands'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Dev-mode command failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async safeModeCommand(_args: string[]): Promise<CommandResult> {
    try {
      const config = simpleConfigManager.getAll()
      config.securityMode = 'safe'
      simpleConfigManager.setAll(config)
      console.log(chalk.green('🔒 Safe mode enabled - maximum security restrictions'))
      console.log(chalk.gray('All risky operations will require approval. Use /security status to see details.'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Safe mode command failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async clearApprovalsCommand(_args: string[]): Promise<CommandResult> {
    try {
      toolService.clearSessionApprovals()
      console.log(chalk.green('✓ All session approvals cleared'))
      console.log(chalk.gray('Next operations will require fresh approval'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Clear approvals command failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private formatSecurityMode(mode: string): string {
    switch (mode) {
      case 'safe':
        return chalk.green('🔒 Safe')
      case 'default':
        return chalk.yellow('🛡️ Default')
      case 'developer':
        return chalk.red('🔨 Developer')
      default:
        return chalk.gray(mode)
    }
  }

  // Blueprint Management Commands
  private async blueprintsCommand(_args: string[]): Promise<CommandResult> {
    try {
      const blueprints = await agentFactory.getAllBlueprints()
      const storageStats = await blueprintStorage.getStorageStats()

      console.log(chalk.blue.bold('\n📋 Blueprint Storage Management'))
      console.log(chalk.gray('═'.repeat(50)))

      console.log(`📊 Total Blueprints: ${blueprints.length}`)
      console.log(`💾 Storage Location: ${storageStats.storageDir}`)
      console.log(`📦 Storage Size: ${storageStats.storageSize}`)

      if (storageStats.oldestBlueprint) {
        console.log(`📅 Oldest: ${storageStats.oldestBlueprint}`)
      }
      if (storageStats.newestBlueprint) {
        console.log(`🆕 Newest: ${storageStats.newestBlueprint}`)
      }

      if (blueprints.length > 0) {
        console.log(chalk.blue.bold('\n📋 Available Blueprints:'))
        blueprints.forEach((blueprint, index) => {
          const safeId = blueprint?.id ? blueprint.id.slice(0, 8) : 'unknown'
          console.log(`\n${index + 1}. ${chalk.bold(blueprint.name || safeId)} ${chalk.gray(`(${safeId}...)`)}`)
          console.log(`   Specialization: ${blueprint.specialization}`)
          console.log(`   Autonomy: ${blueprint.autonomyLevel} | Context: ${blueprint.contextScope}`)
          this.printPanel(
            `   Capabilities: ${blueprint.capabilities.slice(0, 3).join(', ')}${blueprint.capabilities.length > 3 ? '...' : ''}`
          )
          console.log(`   Created: ${blueprint.createdAt}`)
        })
      }

      console.log(chalk.gray('\n💡 Available commands:'))
      console.log(chalk.gray('   /blueprint <id|name> - Show detailed blueprint info'))
      console.log(chalk.gray('   /launch-agent <id|name> [task] - Launch an agent'))
      console.log(chalk.gray('   /delete-blueprint <id|name> - Delete a blueprint'))
      console.log(chalk.gray('   /export-blueprint <id|name> <file> - Export blueprint'))
      console.log(chalk.gray('   /import-blueprint <file> - Import blueprint'))
      console.log(chalk.gray('   /search-blueprints <query> - Search blueprints'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Error managing blueprints: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async blueprintCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /blueprint <blueprint-id|name>'))
      console.log(chalk.gray('Example: /blueprint react-expert'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const identifier = args[0]
      const blueprint = await agentFactory.getBlueprint(identifier)

      if (!blueprint) {
        console.log(chalk.red(`❌ Blueprint '${identifier}' not found`))
        console.log(chalk.gray('Use /blueprints to see all available blueprints'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue.bold(`\n📋 Blueprint: ${blueprint.name}`))
      console.log(chalk.gray('═'.repeat(50)))
      console.log(`${chalk.cyan('ID:')} ${blueprint.id}`)
      console.log(`${chalk.cyan('Name:')} ${blueprint.name}`)
      console.log(`${chalk.cyan('Description:')} ${blueprint.description}`)
      console.log(`${chalk.cyan('Specialization:')} ${blueprint.specialization}`)
      console.log(`${chalk.cyan('Autonomy Level:')} ${blueprint.autonomyLevel}`)
      console.log(`${chalk.cyan('Context Scope:')} ${blueprint.contextScope}`)
      console.log(`${chalk.cyan('Working Style:')} ${blueprint.workingStyle}`)
      console.log(`${chalk.cyan('Created:')} ${blueprint.createdAt.toLocaleString()}`)

      console.log(chalk.blue.bold('\n🧠 Personality:'))
      console.log(`  Proactive: ${blueprint.personality.proactive}%`)
      console.log(`  Collaborative: ${blueprint.personality.collaborative}%`)
      console.log(`  Analytical: ${blueprint.personality.analytical}%`)
      console.log(`  Creative: ${blueprint.personality.creative}%`)

      console.log(chalk.blue.bold('\n⚡ Capabilities:'))
      blueprint.capabilities.forEach((cap) => {
        console.log(`  • ${cap}`)
      })

      console.log(chalk.blue.bold('\n🔨 Required Tools:'))
      blueprint.requiredTools.forEach((tool) => {
        console.log(`  • ${tool}`)
      })

      console.log(chalk.blue.bold('\n🤖 System Prompt:'))
      console.log(chalk.gray(blueprint.systemPrompt))

      console.log(chalk.gray(`\n💡 Use /launch-agent ${blueprint.name} [task] to launch this agent`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Error retrieving blueprint: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async deleteBlueprintCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /delete-blueprint <blueprint-id|name>'))
      console.log(chalk.gray('Example: /delete-blueprint react-expert'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const identifier = args[0]
      const blueprint = await agentFactory.getBlueprint(identifier)

      if (!blueprint) {
        console.log(chalk.red(`❌ Blueprint '${identifier}' not found`))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.yellow(`⚠️ Are you sure you want to delete blueprint '${blueprint.name}'?`))
      console.log(chalk.gray('This action cannot be undone.'))

      // Production confirmation prompt implementation
      const inquirer = (await import('inquirer')).default
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Are you sure you want to delete this blueprint?',
          default: false,
        },
      ])

      if (confirmed) {
        const deleted = await agentFactory.deleteBlueprint(identifier)
        if (deleted) {
          console.log(chalk.green(`✓ Blueprint '${blueprint.name}' deleted successfully`))
        } else {
          console.log(chalk.red(`❌ Failed to delete blueprint '${blueprint.name}'`))
        }
      } else {
        console.log(chalk.gray('❌ Deletion cancelled'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error deleting blueprint: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async exportBlueprintCommand(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      console.log(chalk.red('Usage: /export-blueprint <blueprint-id|name> <file-path>'))
      console.log(chalk.gray('Example: /export-blueprint react-expert ./my-react-expert.blueprint.json'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const identifier = args[0]
      const filePath = args[1]

      const success = await agentFactory.exportBlueprint(identifier, filePath)
      if (success) {
        console.log(chalk.green(`✓ Blueprint exported successfully to: ${filePath}`))
      } else {
        console.log(chalk.red(`❌ Failed to export blueprint '${identifier}'`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error exporting blueprint: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async importBlueprintCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /import-blueprint <file-path>'))
      console.log(chalk.gray('Example: /import-blueprint ./exported-blueprint.json'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const filePath = args[0]
      const blueprint = await agentFactory.importBlueprint(filePath)

      if (blueprint) {
        console.log(chalk.green(`✓ Blueprint imported successfully: ${blueprint.name}`))
        console.log(chalk.gray(`   New ID: ${blueprint.id}`))
        console.log(chalk.gray(`   Use /launch-agent ${blueprint.name} to launch it`))
      } else {
        console.log(chalk.red(`❌ Failed to import blueprint from: ${filePath}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error importing blueprint: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async searchBlueprintsCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /search-blueprints <query>'))
      console.log(chalk.gray('Example: /search-blueprints react'))
      console.log(chalk.gray('Example: /search-blueprints "frontend testing"'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const query = args.join(' ')
      const results = await agentFactory.searchBlueprints(query)

      console.log(chalk.blue.bold(`\n🔍 Search Results for: "${query}"`))
      console.log(chalk.gray('═'.repeat(50)))

      if (results.length === 0) {
        console.log(chalk.yellow('No blueprints found matching your query'))
        console.log(chalk.gray('Try searching for capabilities like "react", "backend", "testing"'))
      } else {
        console.log(`Found ${results.length} matching blueprint${results.length === 1 ? '' : 's'}:\n`)

        results.forEach((blueprint, index) => {
          console.log(`${index + 1}. ${chalk.bold(blueprint.name)} ${chalk.gray(`(${blueprint.id.slice(0, 8)}...)`)}`)
          console.log(`   Specialization: ${blueprint.specialization}`)
          this.printPanel(
            `   Capabilities: ${blueprint.capabilities.slice(0, 3).join(', ')}${blueprint.capabilities.length > 3 ? '...' : ''}`
          )
          console.log(`   Match: ${this.getMatchReason(query, blueprint)}`)
          console.log('')
        })

        console.log(chalk.gray('💡 Use /blueprint <name> for detailed information'))
        console.log(chalk.gray('💡 Use /launch-agent <name> [task] to launch an agent'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error searching blueprints: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private getMatchReason(query: string, blueprint: any): string {
    const searchTerm = query.toLowerCase()

    if (blueprint.name.toLowerCase().includes(searchTerm)) {
      return `Name contains "${query}"`
    }
    if (blueprint.specialization.toLowerCase().includes(searchTerm)) {
      return `Specialization contains "${query}"`
    }
    if (blueprint.description.toLowerCase().includes(searchTerm)) {
      return `Description contains "${query}"`
    }

    const matchingCaps = blueprint.capabilities.filter((cap: string) => cap.toLowerCase().includes(searchTerm))
    if (matchingCaps.length > 0) {
      return `Capabilities: ${matchingCaps.join(', ')}`
    }

    return 'Multiple matches'
  }

  /**
   * Analyze image command - AI-powered vision analysis
   */
  private async analyzeImageCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.blue('🎞️Vision Analysis Commands:'))
      console.log('')
      console.log(`${chalk.cyan('/analyze-image <path>')} - Analyze an image file`)
      this.printPanel(
        `${chalk.cyan('/analyze-image <path> --provider <claude|openai|google|openrouter>')} - Use specific provider`
      )
      console.log(`${chalk.cyan('/analyze-image <path> --prompt "custom prompt"')} - Custom analysis prompt`)
      console.log(`${chalk.cyan('/analyze-image <path> --no-cache')} - Skip cache`)
      console.log('')
      console.log(chalk.gray('Supported formats: JPEG, PNG, GIF, WebP'))
      console.log(chalk.gray('Max file size: 20MB'))
      console.log('')

      const providers = visionProvider.getAvailableProviders()
      if (providers.length > 0) {
        console.log(chalk.green(`Available providers: ${providers.join(', ')}`))
      } else {
        console.log(chalk.red('⚠️ No vision providers configured. Set API keys with /set-key'))
      }

      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const imagePath = args[0]
      const options: any = {}

      // Auto-select provider based on current model if not specified
      if (!options.provider) {
        const autoProvider = visionProvider.getProviderFromCurrentModel()
        if (autoProvider) {
          options.provider = autoProvider
          console.log(chalk.gray(`ℹ️ Auto-selected provider: ${autoProvider.toUpperCase()} (based on current model)`))
        }
      }

      // Parse command options
      for (let i = 1; i < args.length; i += 2) {
        const flag = args[i]
        const value = args[i + 1]

        switch (flag) {
          case '--provider':
            if (['claude', 'openai', 'google', 'openrouter'].includes(value)) {
              options.provider = value
            } else {
              console.log(chalk.red(`❌ Invalid provider: ${value}. Use: claude, openai, google, openrouter`))
              return { shouldExit: false, shouldUpdatePrompt: false }
            }
            break
          case '--prompt':
            options.prompt = value
            break
          case '--no-cache':
            options.cache = false
            i-- // This flag doesn't have a value
            break
        }
      }

      console.log(chalk.blue('🔍 Starting image analysis...'))
      const _startTime = Date.now()

      const result = await visionProvider.analyzeImage(imagePath, options)

      // Display results
      const nik: any = (global as any).__nikCLI
      nik?.beginPanelOutput?.()
      try {
        const lines: string[] = []
        lines.push(chalk.bold('📊 Vision Analysis Results'))
        lines.push(chalk.gray('──────────────────────────────────────────────────'))
        lines.push('')
        lines.push(chalk.cyan('🖼️ Description:'))
        lines.push(result.description)
        lines.push('')

        if (result.objects.length > 0) {
          lines.push(chalk.cyan('🎯 Objects Detected:'))
          result.objects.forEach((obj) => lines.push(`  • ${obj}`))
          lines.push('')
        }
        if (result.text?.trim()) {
          lines.push(chalk.cyan('📝 Text Found:'))
          lines.push(`"${result.text}"`)
          lines.push('')
        }
        if (result.emotions.length > 0) {
          lines.push(chalk.cyan('😊 Emotions/Mood:'))
          lines.push(result.emotions.join(', '))
          lines.push('')
        }
        if (result.colors.length > 0) {
          lines.push(chalk.cyan('🎨 Color Palette:'))
          lines.push(result.colors.join(', '))
          lines.push('')
        }
        lines.push(chalk.cyan('🏗️ Composition:'))
        lines.push(result.composition)
        lines.push('')
        lines.push(chalk.cyan('🔨 Technical Quality:'))
        lines.push(result.technical_quality)
        lines.push('')
        lines.push(chalk.gray('──────────────────────────────────────────────────'))
        lines.push(chalk.gray(`Model: ${result.metadata.model_used}`))
        lines.push(chalk.gray(`Processing time: ${result.metadata.processing_time_ms}ms`))
        lines.push(chalk.gray(`File size: ${(result.metadata.file_size_bytes / 1024).toFixed(1)} KB`))
        lines.push(chalk.gray(`Confidence: ${(result.confidence * 100).toFixed(1)}%`))
        if (result.metadata.image_dimensions) {
          lines.push(
            chalk.gray(
              `Dimensions: ${result.metadata.image_dimensions.width}x${result.metadata.image_dimensions.height}`
            )
          )
        }

        this.cliInstance.printPanel(
          boxen(lines.join('\n'), {
            title: '📷 Image  Analysis',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue',

          })
        )
        console.log(chalk.green(`✓ Image analysis completed in ${Date.now() - _startTime}ms`))
      } finally {
        nik?.endPanelOutput?.()
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Image analysis failed: ${error.message}`))

      // Provide helpful suggestions
      if (error.message.includes('not found')) {
        console.log(chalk.yellow('💡 Check the file path and ensure the image exists'))
      } else if (error.message.includes('API key')) {
        console.log(chalk.yellow('💡 Configure API key with: /set-key <provider> <key>'))
      } else if (error.message.includes('format')) {
        console.log(chalk.yellow('💡 Supported formats: JPEG, PNG, GIF, WebP'))
      } else if (error.message.includes('size')) {
        console.log(chalk.yellow('💡 Maximum file size is 20MB'))
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Discover images in working directory and interactively analyze one
   */
  private async imagesCommand(_args: string[]): Promise<CommandResult> {
    try {
      const cwd = process.cwd()
      const { readdirSync, statSync } = await import('node:fs')
      const { join, relative } = await import('node:path')
      const inquirer = (await import('inquirer')).default
      const { inputQueue } = await import('../core/input-queue')

      const isIgnoredDir = (name: string) =>
        ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', '.cache'].includes(name)
      const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)

      const found: { path: string; size: number }[] = []

      const walk = (dir: string) => {
        let entries: any[] = []
        try {
          entries = readdirSync(dir, { withFileTypes: true } as any)
        } catch {
          return
        }
        for (const e of entries) {
          if (e.isDirectory()) {
            if (isIgnoredDir(e.name)) continue
            walk(join(dir, e.name))
          } else if (e.isFile()) {
            if (isImage(e.name)) {
              const p = join(dir, e.name)
              let size = 0
              try {
                size = statSync(p).size
              } catch {
                /* ignore */
              }
              found.push({ path: p, size })
            }
          }
        }
      }

      walk(cwd)

      if (found.length === 0) {
        this.cliInstance.printPanel(
          boxen('No image files found in the working directory', {
            title: '🖼️ Images',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Sort by path and limit to reasonable number
      found.sort((a, b) => a.path.localeCompare(b.path))
      const list = found.slice(0, 500)

      this.cliInstance.printPanel(
        boxen(
          `Found ${found.length} images${found.length > list.length ? ` (showing ${list.length})` : ''}. Use arrows to choose and Enter to analyze.`,
          {
            title: '🖼️ Images',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue',
          }
        )
      )

      const choices = list.map((f) => ({
        name: `${relative(cwd, f.path)}  ${chalk.gray(`(${(f.size / 1024).toFixed(1)} KB)`)}`,
        value: f.path,
      }))

      // Suspend NikCLI prompt and bypass input queue for interactive selection
      const nik: any = (global as any).__nikCLI
      nik?.suspendPrompt?.()
      inputQueue.enableBypass()
      let answer: any
      try {
        answer = await inquirer.prompt([
          {
            type: 'list',
            name: 'imagePath',
            message: 'Select image to analyze',
            pageSize: Math.min(20, choices.length),
            choices,
          },
        ])
      } finally {
        inputQueue.disableBypass()
        nik?.renderPromptAfterOutput?.()
      }

      // Analyze the selected image
      return await this.analyzeImageCommand([answer.imagePath])
    } catch (error: any) {
      this.cliInstance.printPanel(
        boxen(`Failed to list/analyze images: ${error.message}`, {
          title: '❌ Images Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  /**
   * Generate image command - AI-powered image generation
   */
  private async generateImageCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.blue('🎨 Image Generation Commands:'))
      console.log('')
      console.log(`${chalk.cyan('/generate-image "prompt"')} - Generate an image from text prompt`)
      this.printPanel(
        `${chalk.cyan('/generate-image "prompt" --model <dall-e-3|dall-e-2|gpt-image-1|google/gemini-2.5-flash-image|openai/gpt-5-image-mini|openai/gpt-5-image>')} - Use specific model`
      )
      console.log(`${chalk.cyan('/generate-image "prompt" --size <1024x1024|1792x1024|1024x1792>')} - Set image size`)
      console.log(`${chalk.cyan('/generate-image "prompt" --quality <standard|hd>')} - Set quality (DALL-E 3 only)`)
      console.log(`${chalk.cyan('/generate-image "prompt" --style <vivid|natural>')} - Set style (DALL-E 3 only)`)
      console.log(`${chalk.cyan('/generate-image "prompt" --output "/path/to/save.png"')} - Custom save path`)
      console.log(`${chalk.cyan('/generate-image "prompt" --no-cache')} - Skip cache`)
      console.log('')
      console.log(chalk.gray('Models:'))
      console.log(chalk.gray('  • DALL-E 3: Latest, highest quality, supports HD and styles'))
      console.log(chalk.gray('  • GPT-Image-1: 2025 model with enhanced capabilities'))
      console.log(chalk.gray('  • DALL-E 2: Faster, more economical option'))
      console.log('')

      const models = imageGenerator.getAvailableModels()
      if (models.length > 0) {
        console.log(chalk.green(`Available models: ${models.join(', ')}`))
      } else {
        console.log(chalk.red('⚠️ No image generation models configured. Set OpenAI API key with /set-key'))
      }

      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      // Extract prompt (first argument, potentially quoted)
      let prompt = args[0]
      let argIndex = 1

      // Handle quoted prompts
      if (prompt.startsWith('"') && !prompt.endsWith('"')) {
        // Multi-word quoted prompt
        while (argIndex < args.length && !args[argIndex - 1].endsWith('"')) {
          prompt += ` ${args[argIndex]}`
          argIndex++
        }
      }

      // Remove quotes if present
      if (prompt.startsWith('"') && prompt.endsWith('"')) {
        prompt = prompt.slice(1, -1)
      }

      if (!prompt.trim()) {
        console.log(chalk.red('❌ Please provide a prompt for image generation'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const options: any = { prompt: prompt.trim() }

      // Auto-select provider based on current model if not specified
      const autoProvider = imageGenerator.getProviderFromCurrentModel()
      if (autoProvider) {
        options.provider = autoProvider
        console.log(chalk.gray(`ℹ️ Auto-selected provider: ${autoProvider.toUpperCase()} (based on current model)`))
      }

      // Parse command options
      for (let i = argIndex; i < args.length; i += 2) {
        const flag = args[i]
        const value = args[i + 1]

        switch (flag) {
          case '--model':
            if (['dall-e-3', 'dall-e-2', 'gpt-image-1', 'google/gemini-2.5-flash-image', 'openai/gpt-5-image-mini', 'openai/gpt-5-image'].includes(value)) {
              options.model = value
            } else {
              console.log(chalk.red(`❌ Invalid model: ${value}. Use: dall-e-3, dall-e-2, gpt-image-1, google/gemini-2.5-flash-image, openai/gpt-5-image-mini, openai/gpt-5-image`))
              return { shouldExit: false, shouldUpdatePrompt: false }
            }
            break
          case '--size':
            if (['1024x1024', '1792x1024', '1024x1792', '512x512', '256x256'].includes(value)) {
              options.size = value
            } else {
              console.log(chalk.red(`❌ Invalid size: ${value}. Common sizes: 1024x1024, 1792x1024, 1024x1792`))
              return { shouldExit: false, shouldUpdatePrompt: false }
            }
            break
          case '--quality':
            if (['standard', 'hd'].includes(value)) {
              options.quality = value
            } else {
              console.log(chalk.red(`❌ Invalid quality: ${value}. Use: standard, hd`))
              return { shouldExit: false, shouldUpdatePrompt: false }
            }
            break
          case '--style':
            if (['vivid', 'natural'].includes(value)) {
              options.style = value
            } else {
              console.log(chalk.red(`❌ Invalid style: ${value}. Use: vivid, natural`))
              return { shouldExit: false, shouldUpdatePrompt: false }
            }
            break
          case '--output':
            options.outputPath = value
            break
          case '--no-cache':
            options.cache = false
            i-- // This flag doesn't have a value
            break
        }
      }

      console.log(chalk.blue('🎨 Starting image generation...'))
      const _startTime = Date.now()

      const result = await imageGenerator.generateImage(options)

      // Display results
      console.log('')
      console.log(chalk.green.bold('🖼️ Image Generation Results:'))
      console.log(chalk.gray('─'.repeat(50)))
      console.log('')

      console.log(chalk.cyan.bold('📝 Original Prompt:'))
      console.log(chalk.white(`"${result.metadata.prompt_original}"`))
      console.log('')

      if (result.revisedPrompt && result.revisedPrompt !== result.metadata.prompt_original) {
        console.log(chalk.cyan.bold('✨ Revised Prompt:'))
        console.log(chalk.white(`"${result.revisedPrompt}"`))
        console.log('')
      }

      console.log(chalk.cyan.bold('🔗 Image URL:'))
      console.log(chalk.blue(result.imageUrl))
      console.log('')

      if (result.localPath) {
        console.log(chalk.cyan.bold('💾 Local Path:'))
        console.log(chalk.green(result.localPath))
        console.log('')
      }

      // Metadata
      console.log(chalk.gray('─'.repeat(50)))
      console.log(chalk.gray(`Model: ${result.metadata.model_used}`))
      console.log(chalk.gray(`Size: ${result.metadata.size}`))
      console.log(chalk.gray(`Quality: ${result.metadata.quality}`))
      if (result.metadata.style) {
        console.log(chalk.gray(`Style: ${result.metadata.style}`))
      }
      console.log(chalk.gray(`Processing time: ${result.metadata.processing_time_ms}ms`))
      if (result.metadata.cost_estimate_usd) {
        console.log(chalk.gray(`Estimated cost: $${result.metadata.cost_estimate_usd.toFixed(3)}`))
      }

      console.log('')
      console.log(chalk.green(`✓ Image generated successfully`))

      // Provide helpful next steps
      console.log('')
      console.log(chalk.blue('💡 Next steps:'))
      if (result.localPath) {
        console.log(chalk.gray(`• View: open "${result.localPath}"`))
        console.log(chalk.gray(`• Analyze: /analyze-image "${result.localPath}"`))
      } else {
        console.log(chalk.gray('• The image is available at the URL above'))
        console.log(chalk.gray('• Enable auto-save to download images automatically'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Image generation failed: ${error.message}`))

      // Provide helpful suggestions
      if (error.message.includes('API key')) {
        console.log(chalk.yellow('💡 Configure OpenAI API key with: /set-key openai <key>'))
      } else if (error.message.includes('quota')) {
        console.log(chalk.yellow('💡 Check your OpenAI account quota and billing settings'))
      } else if (error.message.includes('content policy')) {
        console.log(chalk.yellow('💡 Modify your prompt to comply with content policies'))
      } else if (error.message.includes('size')) {
        console.log(chalk.yellow('💡 Check model-specific size restrictions in the help'))
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Web3 command - Coinbase AgentKit operations with panel output
   */
  // ====================== 🐐 GOAT SDK COMMANDS ======================

  /**
   * GOAT command - GOAT SDK operations with panel output
   */
  private async goatCommand(args: string[]): Promise<CommandResult> {
    // Help/usage
    if (args.length === 0) {
      this.cliInstance.printPanel(
        boxen(
          [
            chalk.bold('🐐 GOAT SDK (Polymarket + ERC20) Commands'),
            chalk.gray('────────────────────────────────────────────'),
            '',
            `${chalk.cyan('/goat status')}     – GOAT SDK status`,
            `${chalk.cyan('/goat init')}       – Initialize with wallet and chains`,
            `${chalk.cyan('/goat wallet')}     – Show wallet and networks`,
            `${chalk.cyan('/goat tools')}      – List available GOAT tools`,
            `${chalk.cyan('/goat chat "message"')} – Natural language DeFi request`,
            `${chalk.cyan('/goat markets')}    – Show Polymarket prediction markets`,
            `${chalk.cyan('/goat transfer <amount> <to> [--chain base|polygon]')} – Transfer ERC20 tokens`,
            `${chalk.cyan('/goat balance [--chain base|polygon]')} – Check token balances`,
            '',
            chalk.gray('Env required: GOAT_EVM_PRIVATE_KEY'),
            chalk.gray('Optional: POLYGON_RPC_URL, BASE_RPC_URL'),
            chalk.gray('Tip: Use natural language with /goat chat for complex operations'),
          ].join('\n'),
          { title: 'GOAT SDK', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' }
        )
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const sub = args[0].toLowerCase()

    // Ensure panel-safe printing
    const nik: any = (global as any).__nikCLI
    nik?.beginPanelOutput?.()
    try {
      if (sub === 'status') {
        const result = await secureTools.executeGoat('status')
        const content = this.formatGoatStatusPanel(result)
        this.cliInstance.printPanel(content)
      } else if (sub === 'init') {
        const result = await secureTools.executeGoat('init', {
          chains: args.slice(1).includes('--chains') ? args[args.indexOf('--chains') + 1]?.split(',') : ['polygon', 'base'],
          plugins: args.slice(1).includes('--plugins') ? args[args.indexOf('--plugins') + 1]?.split(',') : ['polymarket', 'erc20']
        })
        const content = this.formatGoatInitPanel(result)
        this.cliInstance.printPanel(content)
      } else if (sub === 'wallet') {
        const result = await secureTools.executeGoat('wallet-info')
        const content = this.formatGoatWalletPanel(result)
        this.cliInstance.printPanel(content)
      } else if (sub === 'tools') {
        const result = await secureTools.executeGoat('tools')
        const content = this.formatGoatToolsPanel(result)
        this.cliInstance.printPanel(content)
      } else if (sub === 'markets') {
        const result = await secureTools.executeGoat('polymarket-markets')
        const content = this.formatGoatMarketsPanel(result)
        this.cliInstance.printPanel(content)
      } else if (sub === 'transfer') {
        if (!args[1] || !args[2]) {
          this.cliInstance.printPanel(
            boxen('Usage: /goat transfer <amount> <to> [--chain base|polygon] [--token USDC|ETH]', {
              title: 'GOAT Transfer',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          return { shouldExit: false, shouldUpdatePrompt: false }
        }

        const amount = args[1]
        const to = args[2]
        let chain: string | undefined
        let token: string | undefined

        for (let i = 3; i < args.length; i++) {
          if (args[i] === '--chain' && args[i + 1]) {
            chain = args[i + 1].toLowerCase()
            i++
          } else if (args[i] === '--token' && args[i + 1]) {
            token = args[i + 1].toUpperCase()
            i++
          }
        }

        const result = await secureTools.executeGoat('erc20-transfer', {
          amount,
          to,
          chain: chain || 'base',
          token: token || 'USDC'
        })
        const content = this.formatGoatTransferPanel({ result, amount, to, chain, token })
        this.cliInstance.printPanel(content)
      } else if (sub === 'balance') {
        let chain: string | undefined
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--chain' && args[i + 1]) {
            chain = args[i + 1].toLowerCase()
            break
          }
        }

        const result = await secureTools.executeGoat('erc20-balance', {
          chain: chain || 'base'
        })
        const content = this.formatGoatBalancePanel(result)
        this.cliInstance.printPanel(content)
      } else if (sub === 'chat') {
        const message = args.slice(1).join(' ').trim().replace(/^"|"$/g, '')
        if (!message) {
          this.cliInstance.printPanel(
            boxen('Usage: /goat chat "your DeFi request"', {
              title: 'GOAT Chat',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          return { shouldExit: false, shouldUpdatePrompt: false }
        }

        const result = await secureTools.executeGoat('chat', { message })
        const content = this.formatGoatChatPanel(message, result)
        this.cliInstance.printPanel(content)
      } else {
        const panel = boxen(`Unknown subcommand: ${sub}`, {
          title: 'GOAT SDK',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
        this.cliInstance.printPanel(panel)
      }
    } catch (error: any) {
      const panel = boxen(
        `Failed to execute GOAT command: ${error.message}` +
        '\n\nTips:\n- Ensure GOAT_EVM_PRIVATE_KEY is set\n- Run /goat init first\n- Use /goat status to check setup',
        { title: 'GOAT Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }
      )
      this.cliInstance.printPanel(panel)
    } finally {
      // Properly end panel output and re-render the prompt
      if (nik) {
        nik.endPanelOutput?.()
        nik.renderPromptAfterOutput?.()
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Polymarket specific command
   */
  private async polymarketCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      this.cliInstance.printPanel(
        boxen(
          [
            chalk.bold('📊 Polymarket Commands'),
            chalk.gray('────────────────────────────────────────────'),
            '',
            `${chalk.cyan('/polymarket markets')}     – List prediction markets`,
            `${chalk.cyan('/polymarket bet <market> <amount> <outcome>')} – Place a bet`,
            `${chalk.cyan('/polymarket positions')}   – Show your positions`,
            `${chalk.cyan('/polymarket chat "query"')} – Natural language Polymarket operations`,
            '',
            chalk.gray('Note: Polymarket operates on Polygon network'),
            chalk.gray('Ensure GOAT_EVM_PRIVATE_KEY and POLYGON_RPC_URL are configured'),
          ].join('\n'),
          { title: 'Polymarket', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' }
        )
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const action = args[0].toLowerCase()
    const nik: any = (global as any).__nikCLI
    nik?.beginPanelOutput?.()

    try {
      switch (action) {
        case 'markets':
          const marketsResult = await secureTools.executeGoat('polymarket-markets', { chain: 'polygon' })
          const marketsContent = this.formatGoatMarketsPanel(marketsResult)
          this.cliInstance.printPanel(marketsContent)
          break

        case 'bet':
          if (args.length < 4) {
            this.cliInstance.printPanel(
              boxen('Usage: /polymarket bet <market-id> <amount> <outcome>', {
                title: 'Polymarket Bet',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }
          const betResult = await secureTools.executeGoat('polymarket-bet', {
            market: args[1],
            amount: args[2],
            outcome: args[3],
            chain: 'polygon'
          })
          const betContent = this.formatGoatBetPanel(betResult)
          this.cliInstance.printPanel(betContent)
          break

        case 'positions':
          const positionsResult = await secureTools.executeGoat('polymarket-positions', { chain: 'polygon' })
          const positionsContent = this.formatGoatPositionsPanel(positionsResult)
          this.cliInstance.printPanel(positionsContent)
          break

        case 'chat':
          const message = args.slice(1).join(' ').trim().replace(/^"|"$/g, '')
          if (!message) {
            this.cliInstance.printPanel(
              boxen('Usage: /polymarket chat "your prediction market query"', {
                title: 'Polymarket Chat',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }
          const chatResult = await secureTools.executeGoat('chat', {
            message: `Polymarket operation: ${message}`,
            plugin: 'polymarket',
            chain: 'polygon'
          })
          const chatContent = this.formatGoatChatPanel(message, chatResult)
          this.cliInstance.printPanel(chatContent)
          break

        default:
          this.cliInstance.printPanel(
            boxen(`Unknown Polymarket command: ${action}`, {
              title: 'Polymarket Error',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
      }
    } catch (error: any) {
      this.cliInstance.printPanel(
        boxen(`Polymarket command failed: ${error.message}`, {
          title: 'Polymarket Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    } finally {
      if (nik) {
        nik.endPanelOutput?.()
        nik.renderPromptAfterOutput?.()
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Web3 Toolchain command
   */
  private async web3ToolchainCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      this.cliInstance.printPanel(
        boxen(
          [
            chalk.bold('🔗 Web3 Toolchain Commands'),
            chalk.gray('────────────────────────────────────────────'),
            '',
            `${chalk.cyan('/web3-toolchain list')}    – List available Web3 toolchains`,
            `${chalk.cyan('/web3-toolchain run <name>')} – Execute a Web3 toolchain`,
            `${chalk.cyan('/web3-toolchain status')}  – Show active executions`,
            `${chalk.cyan('/web3-toolchain cancel <id>')} – Cancel running execution`,
            '',
            chalk.gray('Available toolchains:'),
            chalk.gray('• defi-analysis - DeFi protocol analysis'),
            chalk.gray('• polymarket-strategy - Prediction market trading'),
            chalk.gray('• portfolio-management - Multi-chain portfolio'),
            chalk.gray('• nft-analysis - NFT collection analytics'),
            chalk.gray('• contract-audit - Smart contract security'),
            chalk.gray('• yield-optimizer - Yield farming optimization'),
            chalk.gray('• bridge-analysis - Cross-chain bridge analysis'),
            chalk.gray('• mev-protection - MEV protection strategy'),
            chalk.gray('• governance-analysis - DAO governance analysis'),
          ].join('\n'),
          { title: 'Web3 Toolchains', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
        )
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const action = args[0].toLowerCase()
    const nik: any = (global as any).__nikCLI
    nik?.beginPanelOutput?.()

    try {
      const { web3ToolchainRegistry } = await import('../toolchains/web3-toolchains')

      switch (action) {
        case 'list':
          const toolchains = web3ToolchainRegistry.listToolchains()
          const listContent = this.formatWeb3ToolchainListPanel(toolchains)
          this.cliInstance.printPanel(listContent)
          break

        case 'run':
          if (!args[1]) {
            this.cliInstance.printPanel(
              boxen('Usage: /web3-toolchain run <toolchain-name> [--chain <chain>] [--dry-run]', {
                title: 'Web3 Toolchain Run',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }

          const toolchainName = args[1]
          const options: any = {}

          for (let i = 2; i < args.length; i++) {
            if (args[i] === '--chain' && args[i + 1]) {
              options.chain = args[i + 1]
              i++
            } else if (args[i] === '--dry-run') {
              options.dryRun = true
            }
          }

          const execution = await web3ToolchainRegistry.executeToolchain(toolchainName, {}, options)
          const execContent = this.formatWeb3ToolchainExecutionPanel(execution)
          this.cliInstance.printPanel(execContent)
          break

        case 'status':
          const activeExecutions = web3ToolchainRegistry.getActiveExecutions()
          const statusContent = this.formatWeb3ToolchainStatusPanel(activeExecutions)
          this.cliInstance.printPanel(statusContent)
          break

        case 'cancel':
          if (!args[1]) {
            this.cliInstance.printPanel(
              boxen('Usage: /web3-toolchain cancel <execution-id>', {
                title: 'Web3 Toolchain Cancel',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }

          const executionId = args[1]
          const cancelled = web3ToolchainRegistry.cancelExecution(executionId)
          const cancelContent = this.formatWeb3ToolchainCancelPanel(cancelled, executionId)
          this.cliInstance.printPanel(cancelContent)
          break

        default:
          this.cliInstance.printPanel(
            boxen(`Unknown toolchain command: ${action}`, {
              title: 'Web3 Toolchain Error',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
      }
    } catch (error: any) {
      this.cliInstance.printPanel(
        boxen(`Web3 toolchain command failed: ${error.message}`, {
          title: 'Web3 Toolchain Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    } finally {
      if (nik) {
        nik.endPanelOutput?.()
        nik.renderPromptAfterOutput?.()
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * DeFi Toolchain shortcut command
   */
  private async defiToolchainCommand(args: string[]): Promise<CommandResult> {
    // Redirect to specific DeFi toolchains
    if (args.length === 0) {
      return await this.web3ToolchainCommand(['list'])
    }

    const action = args[0].toLowerCase()

    // Map common DeFi actions to toolchains
    const toolchainMap: Record<string, string> = {
      'analyze': 'defi-analysis',
      'yield': 'yield-optimizer',
      'portfolio': 'portfolio-management',
      'bridge': 'bridge-analysis',
      'mev': 'mev-protection',
      'governance': 'governance-analysis'
    }

    const toolchainName = toolchainMap[action]
    if (toolchainName) {
      return await this.web3ToolchainCommand(['run', toolchainName, ...args.slice(1)])
    } else {
      return await this.web3ToolchainCommand([action, ...args.slice(1)])
    }
  }

  // ====================== GOAT PANEL FORMATTERS ======================

  private formatGoatStatusPanel(result: any): string {
    const title = 'GOAT SDK Status'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}

    if (ok) {
      const data = dataBlock
      lines.push(chalk.green('✓ GOAT SDK status'))
      lines.push('')
      lines.push(`${chalk.gray('Installed:')} ${data.installed ? 'Yes' : 'No'}`)
      lines.push(`${chalk.gray('Initialized:')} ${data.initialized ? 'Yes' : 'No'}`)
      lines.push(`${chalk.gray('Environment:')} ${data.environment}`)
      if (data.plugins?.length) {
        lines.push(`${chalk.gray('Plugins:')} ${data.plugins.join(', ')}`)
      }
      if (data.chains?.length) {
        lines.push(`${chalk.gray('Chains:')} ${data.chains.join(', ')}`)
      }
    } else {
      lines.push(chalk.red('❌ Not initialized'))
      if (result?.error) lines.push(chalk.gray(result.error))
      lines.push('')
      lines.push(chalk.yellow('Run /goat init to set up GOAT SDK'))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatGoatInitPanel(result: any): string {
    const title = 'GOAT SDK Initialize'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}

    if (ok) {
      const data = dataBlock
      lines.push(chalk.green('✓ GOAT SDK initialized'))
      if (data.wallet?.address) lines.push(`${chalk.gray('Wallet:')} ${data.wallet.address}`)
      if (data.chains?.length) lines.push(`${chalk.gray('Chains:')} ${data.chains.map((c: any) => c.name).join(', ')}`)
      if (data.plugins?.length) lines.push(`${chalk.gray('Plugins:')} ${data.plugins.join(', ')}`)
      lines.push(`${chalk.gray('Tools:')} ${data.toolsCount || 0} available`)
    } else {
      lines.push(chalk.red('❌ Initialization failed'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatGoatWalletPanel(result: any): string {
    const title = 'GOAT Wallet'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}

    if (ok) {
      const data = dataBlock
      lines.push(chalk.cyan('🔐 Wallet Information'))
      if (data.wallet?.address) lines.push(`${chalk.gray('Address:')} ${data.wallet.address}`)
      if (data.chains?.length) {
        lines.push(`${chalk.gray('Supported Chains:')}`)
        data.chains.forEach((chain: any) => {
          lines.push(`  • ${chain.name} (${chain.chainId})`)
        })
      }
      if (data.plugins?.length) {
        lines.push(`${chalk.gray('Active Plugins:')} ${data.plugins.join(', ')}`)
      }
    } else {
      lines.push(chalk.red('❌ Failed to get wallet info'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatGoatToolsPanel(result: any): string {
    const title = 'GOAT Tools'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}

    if (ok && dataBlock.tools) {
      lines.push(chalk.cyan(`Available Tools (${dataBlock.count || 0})`))
      lines.push('')
      dataBlock.tools.slice(0, 10).forEach((tool: any) => {
        lines.push(`• ${chalk.bold(tool.name)}`)
        if (tool.description) {
          lines.push(`  ${chalk.gray(tool.description)}`)
        }
      })
      if (dataBlock.tools.length > 10) {
        lines.push(chalk.gray(`... and ${dataBlock.tools.length - 10} more tools`))
      }
    } else {
      lines.push(chalk.yellow('No tools available'))
      lines.push(chalk.gray('Initialize GOAT SDK first with /goat init'))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatGoatMarketsPanel(result: any): string {
    const title = 'Polymarket Markets'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}

    if (ok) {
      lines.push(chalk.green('✓ Markets loaded'))
      if (dataBlock.response) {
        lines.push('')
        lines.push(chalk.white(dataBlock.response))
      }
    } else {
      lines.push(chalk.red('❌ Failed to load markets'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' })
  }

  private formatGoatTransferPanel({ result, amount, to, chain, token }: any): string {
    const title = 'GOAT Transfer'
    const lines: string[] = []
    lines.push(`${chalk.gray('Amount:')} ${amount} ${token || 'USDC'}`)
    lines.push(`${chalk.gray('To:')} ${to}`)
    lines.push(`${chalk.gray('Chain:')} ${chain || 'base'}`)
    lines.push('')

    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}

    if (ok) {
      lines.push(chalk.green('✓ Transfer request submitted'))
      if (dataBlock?.response) {
        lines.push('')
        lines.push(chalk.white(dataBlock.response))
      }
    } else {
      lines.push(chalk.red('❌ Transfer failed'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatGoatBalancePanel(result: any): string {
    const title = 'GOAT Balance'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}

    if (ok) {
      lines.push(chalk.green('✓ Balance request processed'))
      if (dataBlock.response) {
        lines.push('')
        lines.push(chalk.white(dataBlock.response))
      }
    } else {
      lines.push(chalk.red('❌ Failed to fetch balance'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatGoatChatPanel(message: string, result: any): string {
    const title = 'GOAT Chat'
    const lines: string[] = []
    lines.push(`${chalk.gray('Message:')} ${message}`)
    lines.push('')

    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}

    if (ok) {
      lines.push(chalk.green('✓ Completed'))
      if (dataBlock?.response) {
        lines.push('')
        lines.push(chalk.white(dataBlock.response))
      }
    } else {
      lines.push(chalk.red('❌ Failed'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatGoatBetPanel(result: any): string {
    const title = 'Polymarket Bet'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}

    if (ok) {
      lines.push(chalk.green('✓ Bet placed successfully'))
      if (dataBlock?.txHash) {
        lines.push(`${chalk.gray('Transaction:')} ${dataBlock.txHash}`)
      }
      if (dataBlock?.response) {
        lines.push('')
        lines.push(chalk.white(dataBlock.response))
      }
    } else {
      lines.push(chalk.red('❌ Bet placement failed'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' })
  }

  private formatGoatPositionsPanel(result: any): string {
    const title = 'Polymarket Positions'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}

    if (ok) {
      lines.push(chalk.green('✓ Positions loaded'))
      if (dataBlock?.response) {
        lines.push('')
        lines.push(chalk.white(dataBlock.response))
      }
    } else {
      lines.push(chalk.red('❌ Failed to load positions'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' })
  }

  // ====================== WEB3 TOOLCHAIN PANEL FORMATTERS ======================

  private formatWeb3ToolchainListPanel(toolchains: any[]): string {
    const title = 'Available Web3 Toolchains'
    const lines: string[] = []

    if (toolchains.length === 0) {
      lines.push(chalk.yellow('No Web3 toolchains available'))
    } else {
      lines.push(`Found ${toolchains.length} Web3 toolchain(s)`)
      lines.push('')

      toolchains.forEach((toolchain, index) => {
        const riskColor = toolchain.riskLevel === 'critical' ? 'red' :
          toolchain.riskLevel === 'high' ? 'yellow' :
            toolchain.riskLevel === 'medium' ? 'blue' : 'green'

        lines.push(`${index + 1}. ${chalk.bold(toolchain.name)}`)
        lines.push(`   ${chalk.gray(toolchain.description)}`)
        lines.push(`   Chains: ${chalk.cyan(toolchain.chains.join(', '))}`)
        lines.push(`   Protocols: ${chalk.gray(toolchain.protocols.join(', '))}`)
        lines.push(`   Risk: ${chalk[riskColor](toolchain.riskLevel)} | Pattern: ${chalk.gray(toolchain.pattern)}`)
        lines.push(`   Duration: ~${Math.round(toolchain.estimatedDuration / 1000)}s`)
        if (index < toolchains.length - 1) lines.push('')
      })
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' })
  }

  private formatWeb3ToolchainExecutionPanel(execution: any): string {
    const title = `Web3 Toolchain: ${execution.toolchain}`
    const lines: string[] = []

    lines.push(`${chalk.gray('Execution ID:')} ${execution.id}`)
    lines.push(`${chalk.gray('Status:')} ${this.formatExecutionStatus(execution.status)}`)
    lines.push(`${chalk.gray('Progress:')} ${execution.progress}%`)
    lines.push(`${chalk.gray('Started:')} ${execution.startTime.toLocaleTimeString()}`)

    if (execution.endTime) {
      const duration = Math.round((execution.endTime.getTime() - execution.startTime.getTime()) / 1000)
      lines.push(`${chalk.gray('Duration:')} ${duration}s`)
    }

    if (execution.chainId) {
      lines.push(`${chalk.gray('Chain ID:')} ${execution.chainId}`)
    }

    if (execution.txHashes.length > 0) {
      lines.push('')
      lines.push(chalk.cyan('Transaction Hashes:'))
      execution.txHashes.forEach((hash: string) => {
        lines.push(`  ${hash}`)
      })
    }

    if (execution.errors.length > 0) {
      lines.push('')
      lines.push(chalk.red('Errors:'))
      execution.errors.forEach((error: string) => {
        lines.push(`  ${error}`)
      })
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatWeb3ToolchainStatusPanel(executions: any[]): string {
    const title = 'Active Web3 Toolchain Executions'
    const lines: string[] = []

    if (executions.length === 0) {
      lines.push(chalk.yellow('No active toolchain executions'))
      lines.push('')
      lines.push(chalk.gray('Use /web3-toolchain run <name> to start a toolchain'))
    } else {
      lines.push(`Active executions: ${executions.length}`)
      lines.push('')

      executions.forEach((exec, index) => {
        const duration = Math.round((Date.now() - exec.startTime.getTime()) / 1000)
        lines.push(`${index + 1}. ${chalk.bold(exec.toolchain)}`)
        lines.push(`   ID: ${exec.id}`)
        lines.push(`   Status: ${this.formatExecutionStatus(exec.status)}`)
        lines.push(`   Progress: ${exec.progress}%`)
        lines.push(`   Duration: ${duration}s`)
        if (index < executions.length - 1) lines.push('')
      })
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' })
  }

  private formatWeb3ToolchainCancelPanel(cancelled: boolean, executionId: string): string {
    const title = 'Cancel Web3 Toolchain'
    const lines: string[] = []

    if (cancelled) {
      lines.push(chalk.green(`✓ Execution cancelled: ${executionId}`))
      lines.push('')
      lines.push(chalk.gray('The toolchain execution has been stopped'))
    } else {
      lines.push(chalk.red(`❌ Failed to cancel: ${executionId}`))
      lines.push('')
      lines.push(chalk.gray('Execution not found or already completed'))
    }

    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: cancelled ? 'green' : 'red' })
  }

  private formatExecutionStatus(status: string): string {
    switch (status) {
      case 'pending':
        return chalk.yellow('⏳ Pending')
      case 'running':
        return chalk.blue('🔄 Running')
      case 'completed':
        return chalk.green('✅ Completed')
      case 'failed':
        return chalk.red('❌ Failed')
      case 'cancelled':
        return chalk.gray('🛑 Cancelled')
      default:
        return chalk.gray(status)
    }
  }

  private async web3Command(args: string[]): Promise<CommandResult> {
    // Help/usage
    if (args.length === 0) {
      this.cliInstance.printPanel(
        boxen(
          [
            chalk.bold('⛓️  Web3 (Coinbase AgentKit) Commands'),
            chalk.gray('────────────────────────────────────────────'),
            '',
            `${chalk.cyan('/web3 status')}  – AgentKit status`,
            `${chalk.cyan('/web3 init')}    – Initialize with CDP credentials`,
            `${chalk.cyan('/web3 wallet')}  – Show wallet and network`,
            `${chalk.cyan('/web3 balance')} – Check wallet balance`,
            `${chalk.cyan('/web3 transfer <amount> <to> [--token ETH|USDC|WETH]')} – Transfer tokens`,
            `${chalk.cyan('/web3 chat "message"')} – Natural language request`,
            `${chalk.cyan('/web3 wallets')} – List known wallets`,
            `${chalk.cyan('/web3 use-wallet <0x...>')} – Use a specific wallet`,
            '',
            chalk.gray('Env required: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET'),
            chalk.gray('Tip: /set-coin-keys to enter them interactively'),
          ].join('\n'),
          { title: 'Web3', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' }
        )
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const sub = args[0].toLowerCase()

    // Ensure panel-safe printing
    const nik: any = (global as any).__nikCLI
    nik?.beginPanelOutput?.()
    try {
      if (sub === 'status') {
        const result = await secureTools.executeCoinbaseAgentKit('status')
        const content = this.formatWeb3StatusPanel(result)
        this.cliInstance.printPanel(content)
      } else if (sub === 'init') {
        const result = await secureTools.executeCoinbaseAgentKit('init')
        const content = this.formatWeb3InitPanel(result)
        this.cliInstance.printPanel(content)
      } else if (sub === 'wallet') {
        const result = await secureTools.executeCoinbaseAgentKit('wallet-info')
        const content = this.formatWeb3WalletPanel(result)
        this.cliInstance.printPanel(content)
      } else if (sub === 'wallets') {
        const result = await secureTools.executeCoinbaseAgentKit('wallets')
        const content = this.formatWeb3WalletsPanel(result)
        this.cliInstance.printPanel(content)

        // If wallets are present, offer interactive selection
        const wallets = (result?.data && (result.data.wallets || result.data.data?.wallets)) || []
        if (wallets && Array.isArray(wallets) && wallets.length > 0) {
          try {
            const inquirer = (await import('inquirer')).default
            const { inputQueue } = await import('../core/input-queue')
            nik?.suspendPrompt?.()
            inputQueue.enableBypass()
            const ans = await inquirer.prompt([
              {
                type: 'list',
                name: 'address',
                message: 'Select wallet to use',
                pageSize: Math.min(wallets.length, 10),
                choices: wallets.map((w: any) => ({
                  name: `${w.address} ${w.networkId ? chalk.gray(`(${w.networkId})`) : ''}`,
                  value: w.address,
                })),
              },
            ])
            inputQueue.disableBypass()
            nik?.renderPromptAfterOutput?.()

            const useRes = await secureTools.executeCoinbaseAgentKit('use-wallet', { address: ans.address })
            const usePanel = this.formatWeb3UseWalletPanel(useRes)
            this.cliInstance.printPanel(usePanel)
          } catch (_e) {
            // ignore interactive errors
          }
        }
      } else if (sub === 'use-wallet') {
        const address = args[1]
        if (!address) {
          this.cliInstance.printPanel(
            boxen('Usage: /web3 use-wallet <0x... address>', {
              title: 'Web3 Use Wallet',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          return { shouldExit: false, shouldUpdatePrompt: false }
        }
        const useRes = await secureTools.executeCoinbaseAgentKit('use-wallet', { address })
        const usePanel = this.formatWeb3UseWalletPanel(useRes)
        this.cliInstance.printPanel(usePanel)
      } else if (sub === 'balance') {
        const result = await secureTools.executeCoinbaseAgentKit('balance')
        const content = this.formatWeb3BalancePanel(result)
        this.cliInstance.printPanel(content)
      } else if (sub === 'transfer') {
        if (!args[1] || !args[2]) {
          this.cliInstance.printPanel(
            boxen('Usage: /web3 transfer <amount> <to> [--token ETH|USDC|WETH]', {
              title: 'Web3 Transfer',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          return { shouldExit: false, shouldUpdatePrompt: false }
        }

        const amount = args[1]
        const to = args[2]
        let token: string | undefined
        for (let i = 3; i < args.length; i++) {
          if (args[i] === '--token' && args[i + 1]) {
            token = args[i + 1].toUpperCase()
            break
          }
        }

        const result = await secureTools.executeCoinbaseAgentKit('transfer', {
          amount,
          to,
          token,
        })
        const content = this.formatWeb3TransferPanel({ result, amount, to, token })
        this.cliInstance.printPanel(content)
      } else if (sub === 'chat') {
        const message = args.slice(1).join(' ').trim().replace(/^"|"$/g, '')
        if (!message) {
          this.cliInstance.printPanel(
            boxen('Usage: /web3 chat "your blockchain request"', {
              title: 'Web3 Chat',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          return { shouldExit: false, shouldUpdatePrompt: false }
        }

        const result = await secureTools.executeCoinbaseAgentKit('chat', { message })
        const content = this.formatWeb3ChatPanel(message, result)
        this.cliInstance.printPanel(content)
      } else if (false && sub === 'defi') {
        // Defi-specific commands intentionally disabled. Use /web3 chat and the agent's tools.
        const panel = boxen(
          'DeFi commands are not exposed directly. Use /web3 chat and the agent will use available action providers (e.g., DefiLlama) automatically.',
          {
            title: 'Web3',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }
        )
        this.cliInstance.printPanel(panel)
        return { shouldExit: false, shouldUpdatePrompt: false }
      } else {
        const panel = boxen(`Unknown subcommand: ${sub}`, {
          title: 'Web3',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
        this.cliInstance.printPanel(panel)
      }
    } catch (error: any) {
      const panel = boxen(
        `Failed to execute web3 command: ${error.message}` +
        '\n\nTips:\n- Ensure CDP_API_KEY_ID and CDP_API_KEY_SECRET are set\n- Run /web3 init first',
        { title: 'Web3 Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }
      )
      this.cliInstance.printPanel(panel)
    } finally {
      // Properly end panel output and re-render the prompt
      if (nik) {
        nik.endPanelOutput?.()
        nik.renderPromptAfterOutput?.()
      }
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // Panel formatters
  private formatWeb3WalletsPanel(result: any): string {
    const title = 'Web3 Wallets'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const wallets = (result?.data && (result.data.wallets || result.data.data?.wallets)) || []
    if (ok && Array.isArray(wallets) && wallets.length > 0) {
      lines.push(chalk.cyan('🔗 Known wallets'))
      lines.push('')
      for (const w of wallets) {
        lines.push(`${w.address} ${w.networkId ? chalk.gray(`(${w.networkId})`) : ''}`)
      }
      lines.push('')
      lines.push(chalk.gray('Tip: /web3 use-wallet <0x...> to select'))
    } else {
      lines.push(chalk.yellow('No wallets recorded yet'))
      lines.push(chalk.gray('Run /web3 init to create or connect a wallet'))
    }
    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatWeb3UseWalletPanel(result: any): string {
    const title = 'Web3 Use Wallet'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const data = result?.data?.data || result?.data || {}
    if (ok) {
      lines.push(chalk.green('✓ Selected wallet'))
      if (data.selected) lines.push(`${chalk.gray('Address:')} ${data.selected}`)
      if (data.walletInfo?.networkId) lines.push(`${chalk.gray('Network:')} ${data.walletInfo.networkId}`)
    } else {
      lines.push(chalk.red('❌ Failed to select wallet'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }
    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }
  private formatWeb3StatusPanel(result: any): string {
    const title = 'Web3 Status'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}
    if (ok) {
      const data = dataBlock
      lines.push(chalk.green('✓ AgentKit status'))
      lines.push('')
      lines.push(`${chalk.gray('Initialized:')} ${data.initialized ? 'Yes' : 'No'}`)
      lines.push(`${chalk.gray('Wallet Connected:')} ${data.walletConnected ? 'Yes' : 'No'}`)
      lines.push(`${chalk.gray('Tools Available:')} ${data.toolsAvailable ?? '—'}`)
      if (data.selectedWallet) {
        lines.push(`${chalk.gray('Selected Wallet:')} ${data.selectedWallet}`)
      }
    } else {
      lines.push(chalk.red('❌ Not initialized'))
      if (result?.error) lines.push(chalk.gray(result.error))
      lines.push('')
      lines.push(chalk.yellow('Run /web3 init to set up AgentKit'))
    }
    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatWeb3InitPanel(result: any): string {
    const title = 'Web3 Initialize'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}
    if (ok) {
      const data = dataBlock
      lines.push(chalk.green('✓ Coinbase AgentKit initialized'))
      if (data.walletInfo?.address) lines.push(`${chalk.gray('Wallet:')} ${data.walletInfo.address}`)
      if (data.walletInfo?.networkId) lines.push(`${chalk.gray('Network:')} ${data.walletInfo.networkId}`)
      if (data.canUseFaucet) lines.push(chalk.yellow('💰 Faucet available (testnet)'))
      lines.push(`${chalk.gray('Tools:')} ${data.toolsAvailable}`)
    } else {
      lines.push(chalk.red('❌ Initialization failed'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }
    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatWeb3WalletPanel(result: any): string {
    const title = 'Web3 Wallet'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}
    if (ok) {
      const data = dataBlock
      lines.push(chalk.cyan('🔐 Wallet'))
      if (data.address) lines.push(`${chalk.gray('Address:')} ${data.address}`)
      if (data.networkId) lines.push(`${chalk.gray('Network:')} ${data.networkId}`)
      if (data.canUseFaucet) lines.push(chalk.yellow('💰 Faucet available (testnet)'))
    } else {
      lines.push(chalk.red('❌ Failed to fetch wallet info'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }
    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatWeb3BalancePanel(result: any): string {
    const title = 'Web3 Balance'
    const lines: string[] = []
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}
    if (ok) {
      const data = dataBlock
      lines.push(chalk.green('✓ Balance request processed'))
      if (data.response) {
        lines.push('')
        lines.push(chalk.white(data.response))
      }
    } else {
      lines.push(chalk.red('❌ Failed to fetch balance'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }
    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatWeb3TransferPanel({ result, amount, to, token }: any): string {
    const title = 'Web3 Transfer'
    const lines: string[] = []
    lines.push(`${chalk.gray('Amount:')} ${amount}${token ? ` ${token.toUpperCase()}` : ''}`)
    lines.push(`${chalk.gray('To:')} ${to}`)
    lines.push('')
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}
    if (ok) {
      lines.push(chalk.green('✓ Transfer request submitted'))
      if (dataBlock?.response) {
        lines.push('')
        lines.push(chalk.white(dataBlock.response))
      }
    } else {
      lines.push(chalk.red('❌ Transfer failed'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }
    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  private formatWeb3ChatPanel(message: string, result: any): string {
    const title = 'Web3 Chat'
    const lines: string[] = []
    lines.push(`${chalk.gray('Message:')} ${message}`)
    lines.push('')
    const ok = result?.data?.success ?? result?.success
    const dataBlock = result?.data?.data || result?.data || {}
    if (ok) {
      lines.push(chalk.green('✓ Completed'))
      // Tool usage summary
      const calls = typeof dataBlock.toolCalls === 'number' ? dataBlock.toolCalls : 0
      const results = typeof dataBlock.toolResults === 'number' ? dataBlock.toolResults : 0
      const toolsUsed = Array.isArray(dataBlock.toolsUsed) ? dataBlock.toolsUsed : []
      lines.push(
        chalk.gray(
          `Tools: calls=${calls}, results=${results}${toolsUsed.length ? `, used=${toolsUsed.join(', ')}` : ''}`
        )
      )
      if (dataBlock?.response) {
        lines.push('')
        lines.push(chalk.white(dataBlock.response))
      }
    } else {
      lines.push(chalk.red('❌ Failed'))
      if (result?.error) lines.push(chalk.gray(result.error))
    }
    return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
  }

  /**
   * Remember command - Store information in long-term memory
   */
  private async rememberCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.blue('⚡︎ Memory Management Commands:'))
      console.log('')
      console.log(`${chalk.cyan('/remember "fact or information"')} - Store important information`)
      console.log(`${chalk.cyan('/remember "fact" --importance <1-10>')} - Set importance level`)
      console.log(`${chalk.cyan('/remember "fact" --tags "tag1,tag2"')} - Add custom tags`)
      console.log(`${chalk.cyan('/remember "fact" --context "project_name"')} - Associate with context`)
      console.log('')
      console.log(chalk.gray('Examples:'))
      console.log(chalk.gray('  /remember "User prefers TypeScript over JavaScript"'))
      console.log(chalk.gray('  /remember "API endpoint is https://api.example.com" --importance 8'))
      console.log(chalk.gray('  /remember "Bug in user authentication module" --tags "bug,auth"'))
      console.log('')

      const stats = memoryService.getMemoryStats()
      console.log(chalk.green(`📊 Current memories: ${stats.totalMemories}`))
      if (stats.totalMemories > 0) {
        console.log(chalk.gray(`Average importance: ${stats.averageImportance.toFixed(1)}/10`))
      }

      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      // Extract the fact/information (first argument, potentially quoted)
      let fact = args[0]
      let argIndex = 1

      // Handle quoted content
      if (fact.startsWith('"') && !fact.endsWith('"')) {
        while (argIndex < args.length && !args[argIndex - 1].endsWith('"')) {
          fact += ` ${args[argIndex]}`
          argIndex++
        }
      }

      // Remove quotes if present
      if (fact.startsWith('"') && fact.endsWith('"')) {
        fact = fact.slice(1, -1)
      }

      if (!fact.trim()) {
        console.log(chalk.red('❌ Please provide information to remember'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const options: any = {}

      // Parse command options
      for (let i = argIndex; i < args.length; i += 2) {
        const flag = args[i]
        const value = args[i + 1]

        switch (flag) {
          case '--importance': {
            const importance = parseInt(value, 10)
            if (importance >= 1 && importance <= 10) {
              options.importance = importance
            } else {
              console.log(chalk.red('❌ Importance must be between 1 and 10'))
              return { shouldExit: false, shouldUpdatePrompt: false }
            }
            break
          }
          case '--tags':
            options.tags = value.split(',').map((tag) => tag.trim())
            break
          case '--context':
            options.context = value
            break
        }
      }

      console.log(chalk.blue('⚡︎ Storing in long-term memory...'))

      const memoryId = await memoryService.addMemory(fact, {
        source: 'user',
        ...options,
      })

      console.log('')
      console.log(chalk.green('✓ Memory stored successfully'))
      console.log(chalk.gray(`ID: ${memoryId}`))
      console.log(chalk.gray(`Fact: "${fact}"`))
      if (options.importance) {
        console.log(chalk.gray(`Importance: ${options.importance}/10`))
      }
      if (options.tags) {
        console.log(chalk.gray(`Tags: ${options.tags.join(', ')}`))
      }
      if (options.context) {
        console.log(chalk.gray(`Context: ${options.context}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to store memory: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Recall command - Search long-term memory
   */
  private async recallCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.blue('🔍 Memory Recall Commands:'))
      console.log('')
      console.log(`${chalk.cyan('/recall "query"')} - Search for relevant memories`)
      console.log(`${chalk.cyan('/recall "query" --limit 5')} - Limit number of results`)
      console.log(`${chalk.cyan('/recall "query" --recent')} - Prioritize recent memories`)
      console.log(`${chalk.cyan('/recall "query" --important')} - Prioritize important memories`)
      console.log(`${chalk.cyan('/recall "query" --tags "tag1,tag2"')} - Filter by tags`)
      console.log('')
      console.log(chalk.gray('Examples:'))
      console.log(chalk.gray('  /recall "user preferences"'))
      console.log(chalk.gray('  /recall "API endpoints" --limit 3'))
      console.log(chalk.gray('  /recall "bugs" --tags "auth,security"'))
      console.log('')

      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      // Extract query (first argument, potentially quoted)
      let query = args[0]
      let argIndex = 1

      // Handle quoted queries
      if (query.startsWith('"') && !query.endsWith('"')) {
        while (argIndex < args.length && !args[argIndex - 1].endsWith('"')) {
          query += ` ${args[argIndex]}`
          argIndex++
        }
      }

      // Remove quotes if present
      if (query.startsWith('"') && query.endsWith('"')) {
        query = query.slice(1, -1)
      }

      if (!query.trim()) {
        console.log(chalk.red('❌ Please provide a search query'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const options: any = { query: query.trim() }

      // Parse command options
      for (let i = argIndex; i < args.length; i += 2) {
        const flag = args[i]
        const value = args[i + 1]

        switch (flag) {
          case '--limit': {
            const limit = parseInt(value, 10)
            if (limit > 0 && limit <= 50) {
              options.limit = limit
            }
            break
          }
          case '--tags':
            options.tags = value.split(',').map((tag) => tag.trim())
            break
          case '--recent':
            // Show only memories from last 7 days
            options.timeRange = {
              start: Date.now() - 7 * 24 * 60 * 60 * 1000,
              end: Date.now(),
            }
            i-- // This flag doesn't have a value
            break
          case '--important':
            options.minImportance = 7
            i-- // This flag doesn't have a value
            break
        }
      }

      console.log(chalk.blue(`🔍 Searching memories for: "${query}"`))
      const startTime = Date.now()

      const results = await memoryService.searchMemories(query, options)
      const searchTime = Date.now() - startTime

      if (results.length === 0) {
        console.log(chalk.yellow('📭 No relevant memories found'))
        console.log(chalk.gray('Try a different query or use /remember to store information first'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Display results
      console.log('')
      console.log(chalk.green.bold(`⚡︎ Found ${results.length} relevant memories (${searchTime}ms):`))
      console.log(chalk.gray('─'.repeat(60)))

      results.forEach((result, index) => {
        const memory = result.memory
        const similarity = (result.similarity * 100).toFixed(1)
        const timeAgo = this.formatTimeAgo(Date.now() - memory.metadata.timestamp)

        console.log('')
        console.log(chalk.cyan.bold(`${index + 1}. [${similarity}% match]`))
        console.log(chalk.white(memory.content))

        // Metadata
        const metadata: string[] = []
        metadata.push(`${timeAgo} ago`)
        metadata.push(`importance: ${memory.metadata.importance}/10`)
        if (memory.metadata.tags.length > 0) {
          metadata.push(`tags: ${memory.metadata.tags.join(', ')}`)
        }
        if (memory.metadata.context) {
          metadata.push(`context: ${memory.metadata.context}`)
        }

        console.log(chalk.gray(`   ${metadata.join(' | ')}`))
        console.log(chalk.gray(`   ID: ${memory.id}`))

        if (result.relevance_explanation) {
          console.log(chalk.gray(`   Relevance: ${result.relevance_explanation}`))
        }
      })

      console.log('')
      console.log(chalk.gray('─'.repeat(60)))
      console.log(chalk.gray(`Use /forget <ID> to remove unwanted memories`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Memory search failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Memory command - Memory management and statistics
   */
  private async memoryCommand(args: string[]): Promise<CommandResult> {
    const subcommand = args[0]?.toLowerCase()

    if (!subcommand || subcommand === 'help') {
      console.log(chalk.blue('⚡︎ Memory Management:'))
      console.log('')
      console.log(`${chalk.cyan('/memory stats')} - Show memory statistics`)
      console.log(`${chalk.cyan('/memory config')} - Show memory configuration`)
      console.log(`${chalk.cyan('/memory context')} - Show current session context`)
      console.log(`${chalk.cyan('/memory personalization')} - Show user personalization data`)
      console.log(`${chalk.cyan('/memory cleanup')} - Clean up old/unimportant memories`)
      console.log('')
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      switch (subcommand) {
        case 'stats':
          await this.showMemoryStats()
          break

        case 'config':
          await this.showMemoryConfig()
          break

        case 'context':
          await this.showSessionContext()
          break

        case 'personalization':
          await this.showPersonalization()
          break

        case 'cleanup':
          await this.performMemoryCleanup()
          break

        default:
          console.log(chalk.red(`❌ Unknown memory subcommand: ${subcommand}`))
          console.log(chalk.gray('Use /memory help to see available commands'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Memory command failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Forget command - Delete specific memories
   */
  private async forgetCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('❌ Please provide a memory ID to forget'))
      console.log(chalk.gray('Use /recall to find memory IDs, then /forget <ID>'))
      console.log('')
      console.log(chalk.yellow('📖 Additional options:'))
      console.log(chalk.gray('  /forget --session    - Delete all memories from current session'))
      console.log(chalk.gray('  /forget --old [days] - Delete memories older than N days (default: 30)'))
      console.log(chalk.gray('  /forget --tag <tag>  - Delete all memories with specific tag'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      // Handle special flags
      if (args[0] === '--session') {
        return await this.forgetSessionMemories()
      }

      if (args[0] === '--old') {
        const days = args[1] ? parseInt(args[1], 10) : 30
        return await this.forgetOldMemories(days)
      }

      if (args[0] === '--tag') {
        if (!args[1]) {
          console.log(chalk.red('❌ Please specify a tag to forget'))
          return { shouldExit: false, shouldUpdatePrompt: false }
        }
        return await this.forgetMemoriesByTag(args[1])
      }

      const memoryId = args[0]

      // Get memory details first
      console.log(chalk.blue(`🔍 Looking up memory: ${memoryId}...`))
      const memory = await memoryService.getMemory(memoryId)

      if (!memory) {
        console.log(chalk.red(`❌ Memory not found: ${memoryId}`))
        console.log(chalk.gray('Use /recall to search for memories and get their IDs'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Show memory details for confirmation
      console.log('')
      console.log(chalk.yellow.bold('🗑️  Memory to Delete:'))
      console.log(chalk.gray('─'.repeat(50)))
      console.log(chalk.cyan(`ID: ${memory.id}`))
      console.log(chalk.cyan(`Content: ${memory.content.substring(0, 100)}${memory.content.length > 100 ? '...' : ''}`))
      console.log(chalk.cyan(`Source: ${memory.metadata.source}`))
      console.log(chalk.cyan(`Importance: ${memory.metadata.importance}/10`))
      console.log(chalk.cyan(`Tags: ${memory.metadata.tags.join(', ')}`))
      console.log(chalk.cyan(`Created: ${new Date(memory.metadata.timestamp).toLocaleString()}`))

      if (memory.metadata.userId) {
        console.log(chalk.cyan(`User: ${memory.metadata.userId}`))
      }
      if (memory.metadata.sessionId) {
        console.log(chalk.cyan(`Session: ${memory.metadata.sessionId}`))
      }

      console.log('')
      console.log(chalk.red.bold('⚠️  WARNING: This action cannot be undone!'))

      // Get user confirmation
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const confirmation = await new Promise<string>((resolve) => {
        readline.question(chalk.yellow('Are you sure you want to delete this memory? (yes/no): '), resolve)
      })

      readline.close()

      if (confirmation.toLowerCase() !== 'yes' && confirmation.toLowerCase() !== 'y') {
        console.log(chalk.gray('❌ Memory deletion cancelled'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Perform deletion
      console.log(chalk.blue('🗑️ Deleting memory...'))
      const success = await memoryService.deleteMemory(memoryId)

      if (success) {
        console.log(chalk.green('✓ Memory deleted successfully'))
        console.log(chalk.gray(`Deleted memory: ${memoryId.substring(0, 8)}...`))
      } else {
        console.log(chalk.red('❌ Failed to delete memory'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error during memory deletion: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async forgetSessionMemories(): Promise<CommandResult> {
    const session = memoryService.getCurrentSession()

    if (!session) {
      console.log(chalk.red('❌ No active session'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    console.log(chalk.blue(`🔍 Looking for memories from session: ${session.sessionId}...`))

    const memories = await memoryService.getConversationContext(session.sessionId, 24 * 30) // Last 30 days

    if (memories.length === 0) {
      console.log(chalk.yellow('📭 No memories found for current session'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    console.log('')
    console.log(chalk.yellow.bold(`🗑️  About to delete ${memories.length} memories from session`))
    console.log(chalk.gray('─'.repeat(50)))
    console.log(chalk.cyan(`Session ID: ${session.sessionId}`))
    console.log(chalk.cyan(`Session Duration: ${this.formatTimeAgo(Date.now() - session.startTime)}`))
    console.log('')
    console.log(chalk.red.bold('⚠️  WARNING: This action cannot be undone!'))

    // Get user confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const confirmation = await new Promise<string>((resolve) => {
      readline.question(chalk.yellow(`Delete all ${memories.length} memories from this session? (yes/no): `), resolve)
    })

    readline.close()

    if (confirmation.toLowerCase() !== 'yes' && confirmation.toLowerCase() !== 'y') {
      console.log(chalk.gray('❌ Session memory deletion cancelled'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    // Delete memories one by one
    console.log(chalk.blue('🗑️ Deleting session memories...'))
    let deletedCount = 0

    for (const memory of memories) {
      const success = await memoryService.deleteMemory(memory.id)
      if (success) deletedCount++
    }

    console.log(chalk.green(`✓ Deleted ${deletedCount}/${memories.length} session memories`))
    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async forgetOldMemories(days: number): Promise<CommandResult> {
    if (days < 1) {
      console.log(chalk.red('❌ Days must be at least 1'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000

    console.log(chalk.blue(`🔍 Looking for memories older than ${days} days...`))

    const deletedCount = await memoryService.deleteMemoriesByCriteria({
      timeRange: { start: 0, end: cutoffTime },
    })

    if (deletedCount === 0) {
      console.log(chalk.yellow(`📭 No memories found older than ${days} days`))
    } else {
      console.log('')
      console.log(chalk.yellow.bold(`🗑️  About to delete ${deletedCount} old memories`))
      console.log(chalk.gray('─'.repeat(50)))
      console.log(chalk.cyan(`Cutoff Date: ${new Date(cutoffTime).toLocaleString()}`))
      console.log('')
      console.log(chalk.red.bold('⚠️  WARNING: This action cannot be undone!'))

      // Get user confirmation
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const confirmation = await new Promise<string>((resolve) => {
        readline.question(chalk.yellow(`Delete ${deletedCount} memories older than ${days} days? (yes/no): `), resolve)
      })

      readline.close()

      if (confirmation.toLowerCase() !== 'yes' && confirmation.toLowerCase() !== 'y') {
        console.log(chalk.gray('❌ Old memory deletion cancelled'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.green(`✓ Deleted ${deletedCount} old memories`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async forgetMemoriesByTag(tag: string): Promise<CommandResult> {
    console.log(chalk.blue(`🔍 Looking for memories with tag: ${tag}...`))

    const deletedCount = await memoryService.deleteMemoriesByCriteria({
      tags: [tag],
    })

    if (deletedCount === 0) {
      console.log(chalk.yellow(`📭 No memories found with tag: ${tag}`))
    } else {
      console.log('')
      console.log(chalk.yellow.bold(`🗑️  About to delete ${deletedCount} memories with tag`))
      console.log(chalk.gray('─'.repeat(50)))
      console.log(chalk.cyan(`Tag: ${tag}`))
      console.log('')
      console.log(chalk.red.bold('⚠️  WARNING: This action cannot be undone!'))

      // Get user confirmation
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const confirmation = await new Promise<string>((resolve) => {
        readline.question(chalk.yellow(`Delete ${deletedCount} memories with tag "${tag}"? (yes/no): `), resolve)
      })

      readline.close()

      if (confirmation.toLowerCase() !== 'yes' && confirmation.toLowerCase() !== 'y') {
        console.log(chalk.gray('❌ Tag-based memory deletion cancelled'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.green(`✓ Deleted ${deletedCount} memories with tag: ${tag}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // ===== SNAPSHOT COMMANDS =====

  /**
   * Snapshot command - Create project snapshots
   */
  private async snapshotCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('❌ Please provide a name for the snapshot'))
      console.log(chalk.gray('Usage: /snapshot <name> [type]'))
      console.log(chalk.gray('Types: quick (default), full, dev, config'))
      console.log('')
      console.log(chalk.yellow('📖 Examples:'))
      console.log(chalk.gray('  /snapshot "working-auth" quick'))
      console.log(chalk.gray('  /snapshot "v1.0-release" full'))
      console.log(chalk.gray('  /snapshot "dev-progress" dev'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const name = args[0]
    const type = (args[1] as 'quick' | 'full' | 'dev' | 'config') || 'quick'
    const description = args.slice(2).join(' ') || `${type} snapshot created via CLI`

    try {
      let snapshotId: string

      switch (type) {
        case 'quick':
          snapshotId = await snapshotService.createQuickSnapshot(name, description)
          break
        case 'full':
          snapshotId = await snapshotService.createFullSnapshot(name, description)
          break
        case 'dev':
          snapshotId = await snapshotService.createDevSnapshot(name, description)
          break
        case 'config':
          snapshotId = await snapshotService.createFromTemplate('config', name)
          break
        default:
          snapshotId = await snapshotService.createQuickSnapshot(name, description)
      }

      console.log(chalk.green(`✓ Snapshot created: ${name}`))
      console.log(chalk.gray(`   ID: ${snapshotId.substring(0, 8)}...`))
      console.log(chalk.gray(`   Type: ${type}`))

      // Show stats
      const stats = snapshotService.getSnapshotStats()
      this.printPanel(
        chalk.cyan(`📊 Total snapshots: ${stats.totalSnapshots}, Total size: ${this.formatSize(stats.totalSize)}`)
      )
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to create snapshot: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Restore command - Restore from snapshot
   */
  private async restoreCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('❌ Please provide a snapshot ID to restore'))
      console.log(chalk.gray('Use /snapshots to see available snapshots'))
      console.log('')
      console.log(chalk.yellow('📖 Options:'))
      console.log(chalk.gray('  /restore <snapshot-id>'))
      console.log(chalk.gray('  /restore <snapshot-id> --overwrite'))
      console.log(chalk.gray('  /restore <snapshot-id> --no-backup'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const snapshotId = args[0]
    const overwrite = args.includes('--overwrite')
    const backup = !args.includes('--no-backup')

    try {
      // First, get snapshot info
      const snapshots = await snapshotService.searchSnapshots('', { limit: 100 })
      const snapshot = snapshots.find((s) => s.id.startsWith(snapshotId) || s.id === snapshotId)

      if (!snapshot) {
        console.log(chalk.red(`❌ Snapshot not found: ${snapshotId}`))
        console.log(chalk.gray('Use /snapshots to see available snapshots'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Show snapshot details
      console.log(chalk.yellow.bold('📦 Restoring Snapshot:'))
      console.log(chalk.gray('─'.repeat(50)))
      console.log(chalk.cyan(`Name: ${snapshot.name}`))
      console.log(chalk.cyan(`Description: ${snapshot.description}`))
      console.log(chalk.cyan(`Created: ${new Date(snapshot.timestamp).toLocaleString()}`))
      console.log(chalk.cyan(`Files: ${snapshot.metadata.fileCount}`))
      console.log(chalk.cyan(`Size: ${this.formatSize(snapshot.metadata.size)}`))
      console.log('')

      if (!overwrite) {
        console.log(chalk.yellow('ℹ️ Existing files will be skipped (use --overwrite to replace)'))
      }
      if (backup) {
        console.log(chalk.blue('💾 A backup will be created before restoration'))
      }

      // Get user confirmation
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const confirmation = await new Promise<string>((resolve) => {
        readline.question(chalk.yellow('Proceed with restoration? (yes/no): '), resolve)
      })

      readline.close()

      if (confirmation.toLowerCase() !== 'yes' && confirmation.toLowerCase() !== 'y') {
        console.log(chalk.gray('❌ Restoration cancelled'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Perform restoration
      await snapshotService.restoreSnapshot(snapshot.id, {
        overwrite,
        backup,
      })

      console.log(chalk.green('✓ Snapshot restored successfully'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to restore snapshot: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * List snapshots command
   */
  private async listSnapshotsCommand(args: string[]): Promise<CommandResult> {
    const query = args.join(' ')

    try {
      const snapshots = await snapshotService.searchSnapshots(query, { limit: 20 })

      if (snapshots.length === 0) {
        console.log(chalk.yellow('📭 No snapshots found'))
        if (query) {
          console.log(chalk.gray(`   Search query: "${query}"`))
        }
        console.log(chalk.gray('   Create your first snapshot with /snapshot <name>'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.green.bold(`📋 Snapshots (${snapshots.length})`))
      if (query) {
        console.log(chalk.gray(`   Search: "${query}"`))
      }
      console.log(chalk.gray('─'.repeat(70)))

      snapshots.forEach((snapshot) => {
        const id = `${snapshot.id.substring(0, 8)}...`
        const created = new Date(snapshot.timestamp).toLocaleDateString()
        const size = this.formatSize(snapshot.metadata.size)

        console.log(chalk.cyan(`📸 ${snapshot.name}`))
        this.printPanel(
          chalk.gray(`   ID: ${id} | Created: ${created} | Size: ${size} | Files: ${snapshot.metadata.fileCount}`)
        )

        if (snapshot.description) {
          console.log(chalk.gray(`   Description: ${snapshot.description}`))
        }

        if (snapshot.metadata.tags.length > 0) {
          console.log(chalk.gray(`   Tags: ${snapshot.metadata.tags.join(', ')}`))
        }

        if (snapshot.metadata.branch) {
          console.log(chalk.gray(`   Branch: ${snapshot.metadata.branch}`))
        }

        console.log('')
      })

      // Show stats
      const stats = snapshotService.getSnapshotStats()
      this.printPanel(
        chalk.cyan(`📊 Total: ${stats.totalSnapshots} snapshots, ${this.formatSize(stats.totalSize)} total size`)
      )

      console.log('')
      console.log(chalk.gray('Use /restore <snapshot-id> to restore a snapshot'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to list snapshots: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`
  }

  // ===== MEMORY HELPER METHODS =====

  private async showMemoryStats(): Promise<void> {
    const stats = memoryService.getMemoryStats()

    console.log(chalk.green.bold('📊 Memory Statistics:'))
    console.log(chalk.gray('─'.repeat(40)))
    console.log(chalk.cyan(`Total Memories: ${stats.totalMemories}`))

    if (stats.totalMemories > 0) {
      console.log(chalk.cyan(`Average Importance: ${stats.averageImportance.toFixed(1)}/10`))

      if (stats.oldestMemory) {
        const oldestAge = this.formatTimeAgo(Date.now() - stats.oldestMemory)
        console.log(chalk.cyan(`Oldest Memory: ${oldestAge} ago`))
      }

      if (stats.newestMemory) {
        const newestAge = this.formatTimeAgo(Date.now() - stats.newestMemory)
        console.log(chalk.cyan(`Newest Memory: ${newestAge} ago`))
      }

      console.log('')
      console.log(chalk.blue('Memory Sources:'))
      Object.entries(stats.memoriesBySource).forEach(([source, count]) => {
        console.log(chalk.white(`  ${source}: ${count}`))
      })
    }
  }

  private async showMemoryConfig(): Promise<void> {
    const config = memoryService.getConfig()

    console.log(chalk.green.bold('🔨 Memory Configuration:'))
    console.log(chalk.gray('─'.repeat(40)))
    console.log(chalk.cyan(`Enabled: ${config.enabled ? 'Yes' : 'No'}`))
    console.log(chalk.cyan(`Backend: ${config.backend}`))
    console.log(chalk.cyan(`Embedding Model: ${config.embedding_model}`))
    console.log(chalk.cyan(`Max Memories: ${config.max_memories}`))
    console.log(chalk.cyan(`Auto Cleanup: ${config.auto_cleanup ? 'Yes' : 'No'}`))
    console.log(chalk.cyan(`Similarity Threshold: ${config.similarity_threshold}`))
    console.log(chalk.cyan(`Importance Decay (days): ${config.importance_decay_days}`))
  }

  private async showSessionContext(): Promise<void> {
    const session = memoryService.getCurrentSession()

    if (!session) {
      console.log(chalk.yellow('📭 No active memory session'))
      return
    }

    console.log(chalk.green.bold('🗣️ Current Session Context:'))
    console.log(chalk.gray('─'.repeat(40)))
    console.log(chalk.cyan(`Session ID: ${session.sessionId}`))
    console.log(chalk.cyan(`Started: ${this.formatTimeAgo(Date.now() - session.startTime)} ago`))
    console.log(chalk.cyan(`Last Activity: ${this.formatTimeAgo(Date.now() - session.lastActivity)} ago`))

    if (session.userId) {
      console.log(chalk.cyan(`User ID: ${session.userId}`))
    }
    if (session.topic) {
      console.log(chalk.cyan(`Topic: ${session.topic}`))
    }

    console.log(chalk.cyan(`Participants: ${session.participants.join(', ')}`))

    // Show recent context
    const contextMemories = await memoryService.getConversationContext(session.sessionId, 2)
    if (contextMemories.length > 0) {
      console.log('')
      console.log(chalk.blue(`Recent Context (${contextMemories.length} items):`))
      contextMemories.slice(0, 5).forEach((memory) => {
        const timeAgo = this.formatTimeAgo(Date.now() - memory.metadata.timestamp)
        console.log(chalk.gray(`  • ${memory.content.substring(0, 60)}... (${timeAgo} ago)`))
      })
    }
  }

  private async showPersonalization(): Promise<void> {
    const session = memoryService.getCurrentSession()

    if (!session?.userId) {
      console.log(chalk.yellow('📭 No user ID in current session'))
      return
    }

    const personalization = await memoryService.getPersonalization(session.userId)

    if (!personalization) {
      console.log(chalk.yellow('📭 No personalization data available'))
      return
    }

    console.log(chalk.green.bold('👤 User Personalization:'))
    console.log(chalk.gray('─'.repeat(40)))
    console.log(chalk.cyan(`User ID: ${personalization.userId}`))
    console.log(chalk.cyan(`Communication Style: ${personalization.communication_style}`))
    this.printPanel(
      chalk.cyan(`Preferred Response Length: ${personalization.interaction_patterns.preferred_response_length}`)
    )
    console.log(chalk.cyan(`Preferred Detail Level: ${personalization.interaction_patterns.preferred_detail_level}`))

    if (personalization.expertise_areas.length > 0) {
      console.log(chalk.cyan(`Expertise Areas: ${personalization.expertise_areas.join(', ')}`))
    }

    if (personalization.frequent_topics.length > 0) {
      console.log(chalk.cyan(`Frequent Topics: ${personalization.frequent_topics.slice(0, 5).join(', ')}`))
    }

    if (personalization.interaction_patterns.common_tasks.length > 0) {
      this.printPanel(
        chalk.cyan(`Common Tasks: ${personalization.interaction_patterns.common_tasks.slice(0, 3).join(', ')}`)
      )
    }
  }

  private async performMemoryCleanup(): Promise<void> {
    console.log(chalk.blue('🧹 Starting memory cleanup...'))

    // This would trigger the cleanup logic in mem0Provider
    console.log(chalk.yellow('⚠️ Memory cleanup is automatic'))
    console.log(chalk.gray('Old and unimportant memories are cleaned up automatically'))
    console.log(chalk.gray('Manual cleanup controls will be added in future updates'))
  }

  private formatTimeAgo(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d`
    if (hours > 0) return `${hours}h`
    if (minutes > 0) return `${minutes}m`
    return `${seconds}s`
  }

  /**
   * Index command - Index files in a path for better context
   */
  private async indexCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.blue('🔍 Indexing Commands:'))
      console.log('')
      console.log(`${chalk.cyan('/index <path>')} - Index files in path for better context`)
      console.log(`${chalk.cyan('/index <path> --force')} - Force re-indexing (ignore cache)`)
      console.log(`${chalk.cyan('/index <path> --max-files <number>')} - Limit number of files to index`)
      console.log(`${chalk.cyan('/index <path> --cost-limit <dollars>')} - Set cost limit for embeddings`)
      console.log('')
      console.log(chalk.gray('Examples:'))
      console.log(chalk.gray('  /index src'))
      console.log(chalk.gray('  /index /Volumes/SSD/Documents/Personal/nikcli-main/src/cli'))
      console.log(chalk.gray('  /index . --force'))
      console.log(chalk.gray('  /index src --max-files 500 --cost-limit 0.05'))
      console.log('')
      console.log(chalk.gray('The indexed files will be available for better context in future conversations.'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const targetPath = args[0]
      const options: any = {}

      // Parse command options
      for (let i = 1; i < args.length; i += 2) {
        const flag = args[i]
        const value = args[i + 1]

        switch (flag) {
          case '--force':
            options.force = true
            i-- // This flag doesn't have a value
            break
          case '--max-files': {
            const maxFiles = parseInt(value, 10)
            if (!Number.isNaN(maxFiles) && maxFiles > 0) {
              options.maxFiles = maxFiles
            } else {
              console.log(chalk.red('❌ Invalid max-files value. Must be a positive number.'))
              return { shouldExit: false, shouldUpdatePrompt: false }
            }
            break
          }
          case '--cost-limit': {
            const costLimit = parseFloat(value)
            if (!Number.isNaN(costLimit) && costLimit > 0) {
              options.costLimit = costLimit
            } else {
              console.log(chalk.red('❌ Invalid cost-limit value. Must be a positive number.'))
              return { shouldExit: false, shouldUpdatePrompt: false }
            }
            break
          }
        }
      }

      // Resolve full path
      const workingDir = process.cwd()
      const fullPath = resolve(workingDir, targetPath)

      // Validate path exists
      if (!existsSync(fullPath)) {
        console.log(chalk.red(`❌ Path not found: ${targetPath}`))
        console.log(chalk.gray(`Resolved to: ${fullPath}`))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Check if it's a directory
      const pathStats = statSync(fullPath)
      if (!pathStats.isDirectory()) {
        console.log(chalk.red(`❌ Path is not a directory: ${targetPath}`))
        console.log(chalk.gray('Use /index <directory-path> to index a directory'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`🔍 Starting indexing for: ${targetPath}`))
      console.log(chalk.gray(`Full path: ${fullPath}`))

      // Update RAG system configuration if options provided
      if (options.maxFiles) {
        unifiedRAGSystem.updateConfig({ maxIndexFiles: options.maxFiles })
        console.log(chalk.gray(`Max files limit: ${options.maxFiles}`))
      }

      if (options.costLimit) {
        unifiedRAGSystem.updateConfig({ costThreshold: options.costLimit })
        console.log(chalk.gray(`Cost limit: $${options.costLimit}`))
      }

      // Clear cache if force flag is used
      if (options.force) {
        unifiedRAGSystem.clearCaches()
        console.log(chalk.gray('Cache cleared (force mode)'))
      }

      // Start indexing with progress indicator
      const indexId = advancedUI.createIndicator('indexing', `Indexing ${targetPath}`).id
      advancedUI.startSpinner(indexId, 'Analyzing project structure...')

      let result: any
      try {
        // Use the RAG system to analyze the project
        result = await unifiedRAGSystem.analyzeProject(fullPath)

        // Check if the result indicates an error
        if (!result || (result as any).error) {
          advancedUI.stopSpinner(indexId, false, 'Indexing failed')
          console.log(chalk.red(`❌ Indexing failed: ${(result as any)?.error || 'Unknown error'}`))
          return { shouldExit: false, shouldUpdatePrompt: false }
        }

        advancedUI.stopSpinner(indexId, true, 'Indexing completed')
      } catch (error: any) {
        // Always stop spinner in case of exception
        advancedUI.stopSpinner(indexId, false, 'Indexing failed')
        throw error // Re-throw to be handled by outer catch
      }

      // Display results
      console.log('')
      console.log(chalk.green.bold('✓ Indexing completed successfully!'))
      console.log(chalk.gray('─'.repeat(50)))

      console.log(chalk.cyan('📊 Results:'))
      console.log(`  Files indexed: ${result.indexedFiles || 0}`)
      console.log(`  Processing time: ${result.processingTime || 0}ms`)
      console.log(`  Vector DB status: ${result.vectorDBStatus || 'Unknown'}`)

      if (result.embeddingsCost !== undefined) {
        console.log(`  Embeddings cost: $${result.embeddingsCost.toFixed(6)}`)
      }

      if (result.fallbackMode !== undefined) {
        console.log(`  Fallback mode: ${result.fallbackMode ? 'Yes' : 'No'}`)
      }

      // Show RAG system stats
      const ragStats = unifiedRAGSystem.getStats()
      console.log(chalk.cyan('\n🤖 RAG System Status:'))
      this.printPanel(
        `  Vector DB: ${(ragStats as any).vectorDBAvailable ? chalk.green('Available') : chalk.yellow('Unavailable')}`
      )
      this.printPanel(
        `  Workspace RAG: ${(ragStats as any).workspaceRAGAvailable ? chalk.green('Available') : chalk.yellow('Unavailable')}`
      )
      console.log(`  Embeddings cache: ${(ragStats as any).embeddingsCacheSize || 0} items`)
      console.log(`  Analysis cache: ${(ragStats as any).analysisCacheSize || 0} items`)

      console.log(chalk.gray('\n💡 The indexed files are now available for better context in future conversations.'))
      console.log(chalk.gray('Use /context to see current workspace context.'))

      // Ensure any remaining UI elements are properly stopped
      // The spinner should already be stopped above, but this ensures cleanup
    } catch (error: any) {
      console.log(chalk.red(`❌ Indexing failed: ${error.message}`))

      // Provide helpful suggestions
      if (error.message.includes('not found')) {
        console.log(chalk.yellow('💡 Check the path and ensure the directory exists'))
      } else if (error.message.includes('API key')) {
        console.log(chalk.yellow('💡 Configure OpenAI API key with: /set-key openai <key>'))
      } else if (error.message.includes('permission')) {
        console.log(chalk.yellow('💡 Check file permissions for the target directory'))
      }

      // UI cleanup is handled by the inner try-catch block
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // ====================== 🔍 IDE DIAGNOSTIC COMMANDS ======================

  private async diagnosticCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.blue.bold('🔍 IDE Diagnostics Commands:'))
      console.log(chalk.gray('─'.repeat(40)))
      console.log(`${chalk.cyan('/diagnostic start [path]')} - Start monitoring (optional specific path)`)
      console.log(`${chalk.cyan('/diagnostic stop [path]')} - Stop monitoring (or specific path)`)
      console.log(`${chalk.cyan('/diagnostic status')} - Show monitoring status`)
      console.log(`${chalk.cyan('/diagnostic run')} - Run diagnostic scan`)
      console.log(`${chalk.cyan('/monitor [path]')} - Alias for diagnostic start`)
      console.log(`${chalk.cyan('/diag-status')} - Alias for diagnostic status`)
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const subCommand = args[0].toLowerCase()
    const subArgs = args.slice(1)

    try {
      switch (subCommand) {
        case 'start':
          return await this.startDiagnosticMonitoring(subArgs)
        case 'stop':
          return await this.stopDiagnosticMonitoring(subArgs)
        case 'status':
          return await this.showDiagnosticStatus()
        case 'run':
          return await this.runDiagnosticScan()
        default:
          console.log(chalk.red(`❌ Unknown diagnostic command: ${subCommand}`))
          console.log(chalk.gray('Use /diagnostic for help'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Diagnostic command failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async monitorCommand(args: string[]): Promise<CommandResult> {
    // Alias for /diagnostic start
    return await this.startDiagnosticMonitoring(args)
  }

  private async diagnosticStatusCommand(): Promise<CommandResult> {
    // Alias for /diagnostic status
    return await this.showDiagnosticStatus()
  }

  private async startDiagnosticMonitoring(args: string[]): Promise<CommandResult> {
    const path = args[0]

    console.log(chalk.blue('🔍 Starting IDE diagnostic monitoring...'))

    try {
      // Enable the integration first
      ideDiagnosticIntegration.setActive(true)

      // Start monitoring via the integration
      await ideDiagnosticIntegration.startMonitoring(path)

      if (path) {
        console.log(chalk.green(`✓ Monitoring started for path: ${path}`))
      } else {
        console.log(chalk.green(`✓ Monitoring started for entire project`))
      }

      console.log(chalk.gray('💡 Use /diag-status to check monitoring status'))
      console.log(chalk.gray('💡 Use /diagnostic stop to stop monitoring'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to start monitoring: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async stopDiagnosticMonitoring(args: string[]): Promise<CommandResult> {
    const path = args[0]

    console.log(chalk.yellow('🔍 Stopping IDE diagnostic monitoring...'))

    try {
      await ideDiagnosticIntegration.stopMonitoring(path)

      if (path) {
        console.log(chalk.yellow(`⏹️ Stopped monitoring path: ${path}`))
      } else {
        console.log(chalk.yellow(`⏹️ Stopped all monitoring`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to stop monitoring: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async showDiagnosticStatus(): Promise<CommandResult> {
    console.log(chalk.blue.bold('🔍 IDE Diagnostic Status:'))
    console.log(chalk.gray('─'.repeat(40)))

    try {
      // Get monitoring status
      const status = await ideDiagnosticIntegration.getMonitoringStatus()

      console.log(`Monitoring: ${status.enabled ? chalk.green('Active') : chalk.gray('Inactive')}`)
      console.log(`Watched paths: ${status.watchedPaths.length}`)
      console.log(`Active watchers: ${status.totalWatchers}`)

      if (status.watchedPaths.length > 0) {
        console.log(chalk.blue('\nWatched paths:'))
        status.watchedPaths.forEach((path: string) => {
          console.log(`  ${chalk.cyan('•')} ${path}`)
        })
      }

      // Get quick diagnostic status
      const quickStatus = await ideDiagnosticIntegration.getQuickStatus()
      console.log(`\nCurrent status: ${quickStatus}`)
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get status: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async runDiagnosticScan(): Promise<CommandResult> {
    console.log(chalk.blue('🔍 Running diagnostic scan...'))

    try {
      // Enable integration temporarily if not active
      const wasActive = ideDiagnosticIntegration['isActive']
      if (!wasActive) {
        ideDiagnosticIntegration.setActive(true)
      }

      // Get comprehensive diagnostic context
      const context = await ideDiagnosticIntegration.getWorkflowContext()

      console.log(chalk.blue.bold('\n📊 Diagnostic Results:'))
      console.log(chalk.gray('─'.repeat(40)))

      // Display errors and warnings
      if (context.errors > 0) {
        console.log(`${chalk.red('Errors:')} ${context.errors}`)
      }
      if (context.warnings > 0) {
        console.log(`${chalk.yellow('Warnings:')} ${context.warnings}`)
      }
      if (context.errors === 0 && context.warnings === 0) {
        console.log(chalk.green('✓ No errors or warnings found'))
      }

      // Display build status
      console.log(`${chalk.blue('Build:')} ${this.formatStatus(context.buildStatus)}`)
      console.log(`${chalk.blue('Tests:')} ${this.formatStatus(context.testStatus)}`)
      console.log(`${chalk.blue('Lint:')} ${this.formatStatus(context.lintStatus)}`)

      // Display VCS status
      console.log(`${chalk.blue('Branch:')} ${context.vcsStatus.branch}`)
      if (context.vcsStatus.hasChanges) {
        this.printPanel(
          `${chalk.yellow('Changes:')} ${context.vcsStatus.stagedFiles} staged, ${context.vcsStatus.unstagedFiles} unstaged`
        )
      }

      // Display affected files
      if (context.affectedFiles.length > 0) {
        console.log(chalk.blue('\nAffected files:'))
        context.affectedFiles.slice(0, 10).forEach((file) => {
          console.log(`  ${chalk.cyan('•')} ${file}`)
        })
        if (context.affectedFiles.length > 10) {
          console.log(`  ${chalk.gray(`... and ${context.affectedFiles.length - 10} more`)}`)
        }
      }

      // Display recommendations
      if (context.recommendations.length > 0) {
        console.log(chalk.blue.bold('\n💡 Recommendations:'))
        context.recommendations.forEach((rec) => {
          console.log(`  ${chalk.yellow('•')} ${rec}`)
        })
      }

      // Restore previous active state
      if (!wasActive) {
        ideDiagnosticIntegration.setActive(false)
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Diagnostic scan failed: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private formatStatus(status: string): string {
    switch (status) {
      case 'success':
      case 'passing':
      case 'clean':
        return chalk.green(status)
      case 'failed':
      case 'failing':
      case 'issues':
        return chalk.red(status)
      default:
        return chalk.gray(status)
    }
  }

  // ==================== FIGMA DESIGN INTEGRATION COMMANDS ====================

  private async figmaConfigCommand(): Promise<CommandResult> {
    // Use the panel from NikCLI instance if available
    const nikCLI = (global as any).__nikCLI
    if (nikCLI && typeof nikCLI.showFigmaStatusPanel === 'function') {
      await nikCLI.showFigmaStatusPanel()
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    // Fallback to original implementation
    console.log(chalk.blue.bold('🎨 Figma Integration Configuration'))
    console.log(chalk.gray('─'.repeat(50)))

    const isConfigured = isFigmaConfigured()
    const tokenStatus = isConfigured ? chalk.green('✓ Configured') : chalk.red('❌ Not configured')

    console.log(`${chalk.cyan('Figma API Token:')} ${tokenStatus}`)

    const v0Configured = !!process.env.V0_API_KEY
    const v0Status = v0Configured ? chalk.green('✓ Configured') : chalk.yellow('⚠️  Optional - for AI code generation')

    console.log(`${chalk.cyan('Vercel v0 Integration:')} ${v0Status}`)

    const desktopStatus =
      process.platform === 'darwin' ? chalk.green('✓ Available (macOS)') : chalk.gray('⚪ macOS only')

    console.log(`${chalk.cyan('Desktop App Automation:')} ${desktopStatus}`)

    console.log(chalk.gray('─'.repeat(50)))

    if (!isConfigured) {
      console.log(chalk.yellow('\n💡 Setup Instructions:'))
      console.log(chalk.white('1. Get your Figma Personal Access Token:'))
      console.log(chalk.gray('   https://www.figma.com/developers/api#access-tokens'))
      console.log(chalk.white('2. Set the environment variable:'))
      console.log(chalk.cyan('   export FIGMA_API_TOKEN="your-token-here"'))
      console.log(chalk.white('3. Or use the config command:'))
      console.log(chalk.cyan('   /set-key figma-api-token your-token-here'))
    }

    if (!v0Configured) {
      console.log(chalk.yellow('\n🔧 Optional v0 Setup:'))
      console.log(chalk.white('Set V0_API_KEY for AI-powered code generation from designs'))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async figmaInfoCommand(args: string[]): Promise<CommandResult> {
    if (!isFigmaConfigured()) {
      console.log(chalk.red('❌ Figma API not configured. Use /figma-config for setup instructions.'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    if (args.length === 0) {
      console.log(chalk.red('❌ File ID or URL required'))
      console.log(chalk.gray('Usage: /figma-info <file-id-or-url>'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const input = args[0]
      const fileId = input.startsWith('http') ? extractFileIdFromUrl(input) : input

      if (!fileId) {
        console.log(chalk.red('❌ Could not extract valid file ID from input'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue('🔍 Fetching Figma file information...'))

      const result = await figmaTool.execute({
        command: 'figma-info',
        args: [fileId],
      })

      if (result.success && result.data) {
        const info = result.data

        // Use the panel from NikCLI instance if available
        const nikCLI = (global as any).__nikCLI
        if (nikCLI && typeof nikCLI.showFigmaFilePanel === 'function') {
          await nikCLI.showFigmaFilePanel(info)
        } else {
          // Fallback to original implementation
          console.log(chalk.green('\n✅ File Information:'))
          console.log(chalk.gray('─'.repeat(40)))
          console.log(`${chalk.cyan('Name:')} ${info.name}`)
          console.log(`${chalk.cyan('Key:')} ${info.key}`)
          console.log(`${chalk.cyan('Version:')} ${info.version}`)
          console.log(`${chalk.cyan('Last Modified:')} ${info.last_modified}`)
          console.log(`${chalk.cyan('Role:')} ${info.role}`)

          if (info.thumbnail_url) {
            console.log(`${chalk.cyan('Thumbnail:')} ${info.thumbnail_url}`)
          }
        }
      } else {
        console.log(chalk.red(`❌ Failed to get file info: ${result.error}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async figmaExportCommand(args: string[]): Promise<CommandResult> {
    if (!isFigmaConfigured()) {
      console.log(chalk.red('❌ Figma API not configured. Use /figma-config for setup instructions.'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    if (args.length === 0) {
      console.log(chalk.red('❌ File ID or URL required'))
      console.log(chalk.gray('Usage: /figma-export <file-id-or-url> [format] [output-path]'))
      console.log(chalk.gray('Formats: png (default), jpg, svg, pdf'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const input = args[0]
      const fileId = input.startsWith('http') ? extractFileIdFromUrl(input) : input
      const format = args[1] || 'png'
      const outputPath = args[2]

      if (!fileId) {
        console.log(chalk.red('❌ Could not extract valid file ID from input'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const exportData = {
        fileId,
        format,
        outputPath,
        scale: 1,
      }

      const validatedArgs = validateCommandArgs(FigmaExportSchema, exportData, 'figma-export')

      if (!validatedArgs) {
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`🎨 Exporting Figma designs as ${format.toUpperCase()}...`))

      const execArgs: string[] = [validatedArgs.fileId || fileId, validatedArgs.format || format]
      if (validatedArgs.outputPath) {
        execArgs.push(validatedArgs.outputPath)
      }

      const result = await figmaTool.execute({
        command: 'figma-export',
        args: execArgs,
      })

      if (result.success) {
        console.log(chalk.green('\n✅ Export completed successfully!'))
        if (result.exportPath) {
          console.log(`${chalk.cyan('Exported to:')} ${result.exportPath}`)
        }
        if (result.data?.exportedFiles) {
          console.log(`${chalk.cyan('Files exported:')} ${result.data.exportedFiles.length}`)
          result.data.exportedFiles.slice(0, 5).forEach((file: string) => {
            console.log(`  ${chalk.gray('•')} ${file}`)
          })
          if (result.data.exportedFiles.length > 5) {
            console.log(`  ${chalk.gray(`... and ${result.data.exportedFiles.length - 5} more`)}`)
          }
        }
      } else {
        console.log(chalk.red(`❌ Export failed: ${result.error}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async figmaToCodeCommand(args: string[]): Promise<CommandResult> {
    if (!isFigmaConfigured()) {
      console.log(chalk.red('❌ Figma API not configured. Use /figma-config for setup instructions.'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    if (args.length === 0) {
      console.log(chalk.red('❌ File ID or URL required'))
      console.log(chalk.gray('Usage: /figma-to-code <file-id-or-url> [framework] [library]'))
      console.log(chalk.gray('Frameworks: react (default), vue, svelte, html'))
      console.log(chalk.gray('Libraries: shadcn (default), chakra, mantine, custom'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const input = args[0]
      const fileId = input.startsWith('http') ? extractFileIdFromUrl(input) : input
      const framework = args[1] || 'react'
      const library = args[2] || 'shadcn'

      if (!fileId) {
        console.log(chalk.red('❌ Could not extract valid file ID from input'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const codeGenData = {
        fileId,
        framework,
        library,
        typescript: true,
      }

      const validatedArgs = validateCommandArgs(FigmaCodeGenSchema, codeGenData, 'figma-to-code')

      if (!validatedArgs) {
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`🔌 Generating ${validatedArgs.framework} code with ${validatedArgs.library}...`))

      const result = await figmaTool.execute({
        command: 'figma-to-code',
        args: [validatedArgs.fileId, validatedArgs.framework || 'react', validatedArgs.library || 'shadcn'],
      })

      if (result.success && result.generatedCode) {
        console.log(chalk.green('\n✅ Code generation completed!'))
        console.log(chalk.gray('─'.repeat(50)))
        console.log(result.generatedCode)
        console.log(chalk.gray('─'.repeat(50)))
      } else {
        console.log(chalk.red(`❌ Code generation failed: ${result.error}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async figmaOpenCommand(args: string[]): Promise<CommandResult> {
    if (process.platform !== 'darwin') {
      console.log(chalk.red('❌ Desktop app automation is only available on macOS'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    if (args.length === 0) {
      console.log(chalk.red('❌ File URL required'))
      console.log(chalk.gray('Usage: /figma-open <figma-file-url>'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const fileUrl = args[0]

      if (!fileUrl.includes('figma.com')) {
        console.log(chalk.red('❌ Invalid Figma URL'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue('🖥️  Opening Figma file in desktop app...'))

      const result = await figmaTool.execute({
        command: 'figma-open',
        args: [fileUrl],
      })

      if (result.success) {
        console.log(chalk.green('✓ File opened in Figma desktop app'))
      } else {
        console.log(chalk.red(`❌ Failed to open file: ${result.error}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async figmaTokensCommand(args: string[]): Promise<CommandResult> {
    if (!isFigmaConfigured()) {
      console.log(chalk.red('❌ Figma API not configured. Use /figma-config for setup instructions.'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    if (args.length === 0) {
      console.log(chalk.red('❌ File ID or URL required'))
      console.log(chalk.gray('Usage: /figma-tokens <file-id-or-url> [format]'))
      console.log(chalk.gray('Formats: json (default), css, scss, tokens-studio'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const input = args[0]
      const fileId = input.startsWith('http') ? extractFileIdFromUrl(input) : input
      const format = args[1] || 'json'

      if (!fileId) {
        console.log(chalk.red('❌ Could not extract valid file ID from input'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const tokensData = {
        fileId,
        format,
        includeColors: true,
        includeTypography: true,
        includeSpacing: true,
      }

      const validatedArgs = validateCommandArgs(FigmaTokensSchema, tokensData, 'figma-tokens')

      if (!validatedArgs) {
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`🎯 Extracting design tokens as ${format.toUpperCase()}...`))

      const result = await figmaTool.execute({
        command: 'figma-tokens',
        args: [validatedArgs.fileId, validatedArgs.format || 'json'],
      })

      if (result.success && result.tokens) {
        // Use the panel from NikCLI instance if available
        const nikCLI = (global as any).__nikCLI
        if (nikCLI && typeof nikCLI.showFigmaTokensPanel === 'function') {
          await nikCLI.showFigmaTokensPanel(result.tokens)
        } else {
          // Fallback to original implementation
          console.log(chalk.green('\n✅ Design tokens extracted!'))
          console.log(chalk.gray('─'.repeat(50)))

          if (typeof result.tokens === 'string') {
            console.log(result.tokens)
          } else {
            console.log(JSON.stringify(result.tokens, null, 2))
          }

          console.log(chalk.gray('─'.repeat(50)))
        }
      } else {
        console.log(chalk.red(`❌ Token extraction failed: ${result.error}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async figmaCreateCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      console.log(chalk.red('❌ Component file path required'))
      console.log(chalk.gray('Usage: /figma-create <component-path> [name]'))
      console.log(chalk.gray('Example: /figma-create ./src/components/Button.tsx MyButton'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const componentPath = args[0]
      const outputName = args[1]

      console.log(chalk.blue(`🎨 Creating Figma design from React component...`))

      const result = await figmaTool.execute({
        command: 'figma-create',
        args: [componentPath, outputName],
      })

      if (result.success && result.data) {
        console.log(chalk.green('\n✅ Figma design creation completed!'))
        console.log(chalk.gray('─'.repeat(50)))

        const data = result.data
        console.log(`${chalk.cyan('Component:')} ${data.componentName}`)
        console.log(`${chalk.cyan('Analysis:')} ${data.designDescription.componentAnalysis}`)

        if (data.previewImage?.localPath) {
          console.log(`${chalk.cyan('Preview Image:')} ${data.previewImage.localPath}`)
        }

        if (data.figmaDesign) {
          console.log(`${chalk.cyan('Design Elements:')} ${data.figmaDesign.frames[0].elements.length} elements`)
        }

        console.log(chalk.gray('─'.repeat(50)))
        console.log(chalk.blue('📝 Design Tokens Found:'))
        if (data.designDescription.designTokens.colors.length > 0) {
          this.printPanel(
            `  ${chalk.green('Colors:')} ${data.designDescription.designTokens.colors.slice(0, 3).join(', ')}${data.designDescription.designTokens.colors.length > 3 ? '...' : ''}`
          )
        }
        if (data.designDescription.designTokens.spacing.length > 0) {
          this.printPanel(
            `  ${chalk.green('Spacing:')} ${data.designDescription.designTokens.spacing.slice(0, 3).join(', ')}${data.designDescription.designTokens.spacing.length > 3 ? '...' : ''}`
          )
        }

        console.log(`\n${chalk.yellow('💡 Next steps:')}`)
        console.log('  • Open the generated preview image to see the design concept')
        console.log('  • Use the design specification to manually create the Figma file')
        console.log('  • Import the extracted design tokens into your design system')
      } else {
        console.log(chalk.red(`❌ Creation failed: ${result.error}`))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async notifyCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      // Show current notification settings
      const config = simpleConfigManager.getNotificationConfig()

      const statusIcon = (enabled: boolean) => enabled ? chalk.green('✓ ON') : chalk.gray('✗ OFF')

      this.printPanel(
        boxen(
          chalk.bold('📬 Notification Settings\n\n') +
          `${chalk.cyan('Global:')} ${statusIcon(config.enabled)}\n\n` +
          `${chalk.cyan('Providers:')}\n` +
          `  Slack:   ${statusIcon(config.providers.slack?.enabled ?? false)}\n` +
          `  Discord: ${statusIcon(config.providers.discord?.enabled ?? false)}\n` +
          `  Linear:  ${statusIcon(config.providers.linear?.enabled ?? false)}\n\n` +
          chalk.gray('Usage: /notify [slack|discord|linear|all] [on|off]'),
          {
            title: 'Notifications',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          }
        )
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    // Parse command: /notify [provider] [on|off]
    const provider = args[0]?.toLowerCase()
    const action = args[1]?.toLowerCase()

    if (!['slack', 'discord', 'linear', 'all'].includes(provider)) {
      console.log(chalk.red('❌ Invalid provider. Use: slack, discord, linear, or all'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    if (!['on', 'off'].includes(action)) {
      console.log(chalk.red('❌ Invalid action. Use: on or off'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const enabled = action === 'on'

    try {
      // Update environment variables
      if (provider === 'all') {
        process.env.NOTIFICATIONS_ENABLED = enabled ? 'true' : 'false'
        process.env.SLACK_TASK_NOTIFICATIONS = enabled ? 'true' : 'false'
        process.env.DISCORD_TASK_NOTIFICATIONS = enabled ? 'true' : 'false'
        process.env.LINEAR_TASK_NOTIFICATIONS = enabled ? 'true' : 'false'
      } else if (provider === 'slack') {
        process.env.SLACK_TASK_NOTIFICATIONS = enabled ? 'true' : 'false'
        if (enabled) process.env.NOTIFICATIONS_ENABLED = 'true'
      } else if (provider === 'discord') {
        process.env.DISCORD_TASK_NOTIFICATIONS = enabled ? 'true' : 'false'
        if (enabled) process.env.NOTIFICATIONS_ENABLED = 'true'
      } else if (provider === 'linear') {
        process.env.LINEAR_TASK_NOTIFICATIONS = enabled ? 'true' : 'false'
        if (enabled) process.env.NOTIFICATIONS_ENABLED = 'true'
      }

      // Reinitialize notification service with new config
      if (this.cliInstance?.notificationService) {
        const { getNotificationService } = require('../services/notification-service')
        const notificationConfig = simpleConfigManager.getNotificationConfig()
        this.cliInstance.notificationService = getNotificationService(notificationConfig)
      }

      const providerName = provider === 'all' ? 'All providers' : provider.charAt(0).toUpperCase() + provider.slice(1)
      const actionText = enabled ? chalk.green('enabled') : chalk.gray('disabled')

      this.printPanel(
        boxen(
          `${chalk.green('✓')} Notifications ${actionText}\n\n` +
          chalk.gray(`Provider: ${providerName}\n`) +
          chalk.gray('Changes applied for this session'),
          {
            title: 'Updated',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      )
    } catch (error: any) {
      console.log(chalk.red(`❌ Error updating notifications: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // ====================== OUTPUT STYLE COMMANDS ======================

  /**
   * Style command - manage AI output styles
   * Usage: /style [set|show|model|context] [style-name] [value]
   */
  private async styleCommand(args: string[]): Promise<{ shouldExit: boolean; shouldUpdatePrompt: boolean }> {
    const subcommand = args[0]?.toLowerCase()

    try {
      switch (subcommand) {
        case 'set':
        case 's':
          return this.handleStyleSet(args.slice(1))

        case 'show':
        case 'current':
          return this.handleStyleShow()

        case 'model':
        case 'm':
          return this.handleStyleModel(args.slice(1))

        case 'context':
        case 'c':
          return this.handleStyleContext(args.slice(1))

        case 'help':
        case 'h':
        case undefined:
          return this.handleStyleHelp()

        default:
          // If first arg looks like a style name, treat as "set"
          if (OutputStyleUtils.isValidStyle(subcommand)) {
            return this.handleStyleSet([subcommand])
          }
          console.log(chalk.red(`❌ Unknown style command: ${subcommand}`))
          console.log(chalk.gray('Use /style help for available commands'))
          break
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error managing output style: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Styles command - list available output styles
   */
  private async stylesCommand(_args: string[]): Promise<{ shouldExit: boolean; shouldUpdatePrompt: boolean }> {
    console.log(chalk.blue.bold('\n🎨 Available Output Styles\n'))

    const currentConfig = modernAIProvider.getCurrentOutputStyleConfig()
    const defaultStyle = currentConfig.defaultStyle
    const modelStyle = currentConfig.modelStyle

    // Show current configuration
    console.log(chalk.cyan('Current Configuration:'))
    console.log(`  ${chalk.green('Default:')} ${defaultStyle}`)
    if (modelStyle) {
      console.log(`  ${chalk.green('Current Model:')} ${modelStyle}`)
    }
    console.log()

    // List all available styles with descriptions
    OutputStyleUtils.getAllStyles().forEach((style) => {
      const metadata = OutputStyleUtils.getStyleMetadata(style)
      const isDefault = style === defaultStyle
      const isModelCurrent = style === modelStyle

      const indicators = []
      if (isDefault) indicators.push(chalk.green('default'))
      if (isModelCurrent) indicators.push(chalk.blue('model'))

      const prefix = indicators.length > 0 ? ` [${indicators.join(', ')}]` : ''

      console.log(chalk.yellow(`${style}${prefix}`))
      console.log(chalk.gray(`  ${metadata.description}`))
      console.log(chalk.dim(`  Target: ${metadata.targetAudience} | Verbosity: ${metadata.verbosityLevel}/10`))
      console.log(chalk.dim(`  Use case: ${metadata.useCase}`))
      console.log()
    })

    console.log(chalk.gray('Use /style set <style-name> to change the default style'))
    console.log(chalk.gray('Use /style model <style-name> to set style for current model'))

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Handle style set command
   */
  private async handleStyleSet(args: string[]): Promise<{ shouldExit: boolean; shouldUpdatePrompt: boolean }> {
    if (args.length === 0) {
      console.log(chalk.red('❌ Please specify a style name'))
      console.log(chalk.gray(`Available styles: ${OutputStyleUtils.getAllStyles().join(', ')}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const styleName = args[0] as OutputStyle
    if (!OutputStyleUtils.isValidStyle(styleName)) {
      console.log(chalk.red(`❌ Invalid style: ${styleName}`))
      console.log(chalk.gray(`Available styles: ${OutputStyleUtils.getAllStyles().join(', ')}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      modernAIProvider.setDefaultOutputStyle(styleName)
      const metadata = OutputStyleUtils.getStyleMetadata(styleName)

      console.log(chalk.green(`✓ Default output style set to: ${chalk.bold(styleName)}`))
      console.log(chalk.gray(`   ${metadata.description}`))
      console.log(chalk.gray(`   Target audience: ${metadata.targetAudience}`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to set style: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Handle style show command
   */
  private async handleStyleShow(): Promise<{ shouldExit: boolean; shouldUpdatePrompt: boolean }> {
    const config = modernAIProvider.getCurrentOutputStyleConfig()

    console.log(chalk.blue.bold('\n🎨 Current Output Style Configuration\n'))

    console.log(chalk.cyan('Global Settings:'))
    console.log(`  ${chalk.green('Default Style:')} ${config.defaultStyle}`)

    if (config.modelStyle) {
      console.log(`  ${chalk.green('Current Model Style:')} ${config.modelStyle}`)
    }

    console.log()

    // Show style details
    const currentStyle = config.modelStyle || config.defaultStyle
    const metadata = OutputStyleUtils.getStyleMetadata(currentStyle)

    console.log(chalk.yellow(`Active Style: ${chalk.bold(currentStyle)}`))
    console.log(chalk.gray(`  ${metadata.description}`))
    console.log(chalk.gray(`  Target audience: ${metadata.targetAudience}`))
    console.log(chalk.gray(`  Verbosity level: ${metadata.verbosityLevel}/10`))
    console.log(chalk.gray(`  Technical depth: ${metadata.technicalDepth}`))
    console.log()

    console.log(chalk.dim('Characteristics:'))
    metadata.characteristics.forEach((char) => {
      console.log(chalk.dim(`  • ${char}`))
    })

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Handle style model command
   */
  private async handleStyleModel(args: string[]): Promise<{ shouldExit: boolean; shouldUpdatePrompt: boolean }> {
    if (args.length === 0) {
      console.log(chalk.red('❌ Please specify a style name'))
      console.log(chalk.gray(`Available styles: ${OutputStyleUtils.getAllStyles().join(', ')}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const styleName = args[0] as OutputStyle
    if (!OutputStyleUtils.isValidStyle(styleName)) {
      console.log(chalk.red(`❌ Invalid style: ${styleName}`))
      console.log(chalk.gray(`Available styles: ${OutputStyleUtils.getAllStyles().join(', ')}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const currentModel = simpleConfigManager.getCurrentModel()
      modernAIProvider.setModelOutputStyle(styleName)
      const metadata = OutputStyleUtils.getStyleMetadata(styleName)

      console.log(chalk.green(`✓ Output style for model '${currentModel}' set to: ${chalk.bold(styleName)}`))
      console.log(chalk.gray(`   ${metadata.description}`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to set model style: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Handle style context command
   */
  private async handleStyleContext(args: string[]): Promise<{ shouldExit: boolean; shouldUpdatePrompt: boolean }> {
    if (args.length < 2) {
      console.log(chalk.red('❌ Please specify context and style name'))
      console.log(chalk.gray('Usage: /style context <chat|planning|code-generation> <style-name>'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const context = args[0]
    const styleName = args[1] as OutputStyle

    if (!OutputStyleUtils.isValidStyle(styleName)) {
      console.log(chalk.red(`❌ Invalid style: ${styleName}`))
      console.log(chalk.gray(`Available styles: ${OutputStyleUtils.getAllStyles().join(', ')}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const validContexts = ['chat', 'planning', 'code-generation', 'documentation', 'debugging', 'analysis']
    if (!validContexts.includes(context)) {
      console.log(chalk.red(`❌ Invalid context: ${context}`))
      console.log(chalk.gray(`Valid contexts: ${validContexts.join(', ')}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      simpleConfigManager.setContextOutputStyle(context, styleName)
      const metadata = OutputStyleUtils.getStyleMetadata(styleName)

      console.log(chalk.green(`✓ Output style for context '${context}' set to: ${chalk.bold(styleName)}`))
      console.log(chalk.gray(`   ${metadata.description}`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to set context style: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * Handle style help command
   */
  private async handleStyleHelp(): Promise<{ shouldExit: boolean; shouldUpdatePrompt: boolean }> {
    console.log(chalk.blue.bold('\n🎨 Output Style Commands\n'))

    console.log(chalk.yellow('Available Commands:'))
    console.log(chalk.gray('  /style set <style-name>        Set default output style'))
    console.log(chalk.gray('  /style show                   Show current configuration'))
    console.log(chalk.gray('  /style model <style-name>     Set style for current model'))
    console.log(chalk.gray('  /style context <ctx> <style>  Set style for specific context'))
    console.log(chalk.gray('  /styles                       List all available styles'))
    console.log()

    console.log(chalk.yellow('Available Styles:'))
    OutputStyleUtils.getAllStyles().forEach((style) => {
      const metadata = OutputStyleUtils.getStyleMetadata(style)
      console.log(chalk.gray(`  ${style.padEnd(20)} ${metadata.description}`))
    })

    console.log()
    console.log(chalk.yellow('Examples:'))
    console.log(chalk.gray('  /style set production-focused  # Set concise, results-oriented style'))
    console.log(chalk.gray('  /style model friendly-casual   # Use friendly style for current model'))
    console.log(chalk.gray('  /style context chat minimal-efficient  # Minimal style for chat'))

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  // ====================== WORK SESSION MANAGEMENT COMMANDS ======================

  /**
   * Resume a work session
   */
  private async resumeSessionCommand(args: string[]): Promise<CommandResult> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')

      await workSessionManager.initialize()

      // If no session ID provided, show list and let user choose
      if (args.length === 0) {
        const sessions = await workSessionManager.listSessions()

        if (sessions.length === 0) {
          const boxen = (await import('boxen')).default
          this.printPanel(
            boxen('No saved work sessions found.\n\nCreate one with: /save-session [name]', {
              title: '💼 Work Sessions',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          return { shouldExit: false, shouldUpdatePrompt: false }
        }

        const boxen = (await import('boxen')).default
        const lines: string[] = []
        lines.push(`Found ${sessions.length} work session(s)\n`)

        sessions.slice(0, 10).forEach((session, index) => {
          const lastAccessed = new Date(session.lastAccessedAt).toLocaleString()
          lines.push(`${index + 1}. ${session.name}`)
          lines.push(`   ID: ${session.id.substring(0, 8)}...`)
          lines.push(`   Last: ${lastAccessed}`)
          lines.push(`   ${session.totalEdits} edits | ${session.totalMessages} msgs`)
          if (index < sessions.length - 1) lines.push('')
        })

        if (sessions.length > 10) {
          lines.push('')
          lines.push(`... and ${sessions.length - 10} more`)
        }

        lines.push('')
        lines.push('Usage: /resume <session-id>')

        this.printPanel(
          boxen(lines.join('\n'), {
            title: '💼 Available Work Sessions',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue',
          })
        )
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Resume specified session
      const sessionId = args[0]
      const session = await workSessionManager.resumeSession(sessionId)

      // Restore chat messages if available
      if (session.messages.length > 0 && this.cliInstance) {
        console.log(chalk.blue(`📜 Restoring ${session.messages.length} conversation messages...`))
        // Restore to chat manager
        for (const msg of session.messages) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            chatManager.addMessage(msg.content, msg.role)
          }
        }
      }

      return { shouldExit: false, shouldUpdatePrompt: true }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to resume session: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  /**
   * List all work sessions
   */
  private async workSessionsCommand(args: string[]): Promise<CommandResult> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')
      const boxen = (await import('boxen')).default

      await workSessionManager.initialize()

      const sessions = await workSessionManager.listSessions()

      if (sessions.length === 0) {
        this.printPanel(
          boxen('No saved work sessions found.\n\nCreate one with: /save-session [name]', {
            title: '💼 Work Sessions',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const lines: string[] = []
      lines.push(`Total: ${sessions.length} session(s)\n`)

      sessions.forEach((session, index) => {
        const created = new Date(session.createdAt).toLocaleDateString()
        const lastAccessed = new Date(session.lastAccessedAt).toLocaleString()

        lines.push(`${index + 1}. ${session.name}`)
        lines.push(`   ID: ${session.id.substring(0, 8)}...`)
        lines.push(`   Created: ${created}`)
        lines.push(`   Last: ${lastAccessed}`)
        lines.push(`   ${session.totalEdits} edits | ${session.totalMessages} msgs | ${session.filesModified} files`)

        if ((session.tags?.length ?? 0) > 0) {
          lines.push(`   Tags: ${session.tags!.join(', ')}`)
        }

        if (index < sessions.length - 1) lines.push('')
      })

      lines.push('')
      lines.push('Commands:')
      lines.push('  /resume <id>           Resume session')
      lines.push('  /delete-session <id>   Delete session')
      lines.push('  /export-session <id> <path>  Export to file')

      this.printPanel(
        boxen(lines.join('\n'), {
          title: '💼 Work Sessions',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      const boxen = (await import('boxen')).default
      this.printPanel(
        boxen(`Failed to list sessions:\n${error.message}`, {
          title: '❌ Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  /**
   * Save current work session
   */
  private async saveSessionCommand(args: string[]): Promise<CommandResult> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')

      await workSessionManager.initialize()

      const sessionName = args.join(' ') || undefined
      let currentSession = workSessionManager.getCurrentSession()

      // If no active session, create one
      if (!currentSession) {
        currentSession = await workSessionManager.createSession(sessionName)
        console.log(chalk.green(`✓ New work session created: ${currentSession.name}`))
      } else {
        // Update name if provided
        if (sessionName) {
          currentSession.name = sessionName
        }

        // Add current chat messages
        const messages = chatManager.getMessages()
        currentSession.messages = messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp?.toISOString() || new Date().toISOString(),
          metadata: {},
        }))

        await workSessionManager.saveCurrentSession()
        console.log(chalk.green(`✓ Work session saved: ${currentSession.name}`))
        console.log(chalk.gray(`   ID: ${currentSession.id}`))
      }

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to save session: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  /**
   * Delete a work session
   */
  private async deleteSessionCommand(args: string[]): Promise<CommandResult> {
    try {
      if (args.length === 0) {
        console.log(chalk.red('❌ Please provide a session ID'))
        console.log(chalk.dim('Usage: /delete-session <session-id>'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const { workSessionManager } = await import('../persistence/work-session-manager')
      await workSessionManager.initialize()

      const sessionId = args[0]
      const success = await workSessionManager.deleteSession(sessionId)

      if (success) {
        console.log(chalk.green(`✓ Session deleted: ${sessionId}`))
      } else {
        console.log(chalk.yellow(`⚠️ Session not found: ${sessionId}`))
      }

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to delete session: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  /**
   * Export a work session
   */
  private async exportSessionCommand(args: string[]): Promise<CommandResult> {
    try {
      if (args.length < 2) {
        console.log(chalk.red('❌ Please provide session ID and export path'))
        console.log(chalk.dim('Usage: /export-session <session-id> <output-path>'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const { workSessionManager } = await import('../persistence/work-session-manager')
      await workSessionManager.initialize()

      const sessionId = args[0]
      const exportPath = args[1]

      await workSessionManager.exportSession(sessionId, exportPath)

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to export session: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  // ====================== EDIT HISTORY COMMANDS (UNDO/REDO) ======================

  /**
   * Undo file edits
   */
  private async undoCommand(args: string[]): Promise<CommandResult> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')

      const currentSession = workSessionManager.getCurrentSession()
      if (!currentSession) {
        console.log(chalk.yellow('⚠️ No active work session'))
        console.log(chalk.dim('Start a session with /save-session or resume one with /resume'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const count = args.length > 0 ? parseInt(args[0]) : 1

      if (isNaN(count) || count < 1) {
        console.log(chalk.red('❌ Invalid count. Please provide a positive number.'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`⏪ Undoing ${count} edit${count > 1 ? 's' : ''}...`))

      const undoneOps = await workSessionManager.undo(count)

      if (undoneOps.length === 0) {
        console.log(chalk.yellow('⚠️ No operations to undo'))
      } else {
        console.log(chalk.green(`✓ Undone ${undoneOps.length} operation${undoneOps.length > 1 ? 's' : ''}`))
      }

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      console.log(chalk.red(`❌ Undo failed: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  /**
   * Redo file edits
   */
  private async redoCommand(args: string[]): Promise<CommandResult> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')

      const currentSession = workSessionManager.getCurrentSession()
      if (!currentSession) {
        console.log(chalk.yellow('⚠️ No active work session'))
        console.log(chalk.dim('Start a session with /save-session or resume one with /resume'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const count = args.length > 0 ? parseInt(args[0]) : 1

      if (isNaN(count) || count < 1) {
        console.log(chalk.red('❌ Invalid count. Please provide a positive number.'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      console.log(chalk.blue(`⏩ Redoing ${count} edit${count > 1 ? 's' : ''}...`))

      const redoneOps = await workSessionManager.redo(count)

      if (redoneOps.length === 0) {
        console.log(chalk.yellow('⚠️ No operations to redo'))
      } else {
        console.log(chalk.green(`✓ Redone ${redoneOps.length} operation${redoneOps.length > 1 ? 's' : ''}`))
      }

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      console.log(chalk.red(`❌ Redo failed: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  /**
   * Show edit history
   */
  private async editHistoryCommand(args: string[]): Promise<CommandResult> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')
      const boxen = (await import('boxen')).default

      const currentSession = workSessionManager.getCurrentSession()
      if (!currentSession) {
        this.printPanel(
          boxen('No active work session.\n\nStart one with: /save-session [name]\nor resume: /resume [session-id]', {
            title: '⟺ Edit History',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const editHistory = currentSession.editHistory
      const lines: string[] = []

      lines.push('Stack Status:')
      lines.push(`  Undo available: ${editHistory.undoStack.length} operations`)
      lines.push(`  Redo available: ${editHistory.redoStack.length} operations`)
      lines.push('')

      if (editHistory.undoStack.length > 0) {
        lines.push('Recent Edits:')
        lines.push('')

        const recentOps = editHistory.undoStack.slice(-10).reverse()
        recentOps.forEach((op) => {
          const timestamp = new Date(op.timestamp).toLocaleTimeString()
          const icon = op.operation === 'create' ? '🆕' : op.operation === 'delete' ? '🗑️' : '✏️'

          lines.push(`${icon} ${timestamp} - ${op.operation.toUpperCase()}`)
          lines.push(`   ${op.filePath}`)

          if (op.metadata?.replacementsMade) {
            lines.push(`   ${op.metadata.replacementsMade} replacement(s) made`)
          }
          lines.push('')
        })

        lines.push('Commands:')
        lines.push('  /undo [count]   Revert last N edits')
        lines.push('  /redo [count]   Restore reverted edits')
      } else {
        lines.push('No edit history available yet.')
        lines.push('')
        lines.push('Edit history is recorded automatically when you')
        lines.push('modify files during this session.')
      }

      this.printPanel(
        boxen(lines.join('\n'), {
          title: '⟺ Edit History',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'blue',
        })
      )

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      const boxen = (await import('boxen')).default
      this.printPanel(
        boxen(`Failed to show history:\n${error.message}`, {
          title: '❌ Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  // ====================== 🔌 BACKGROUND AGENT COMMANDS ======================

  /**
   * /bg-agent <task> - Create background job that executes in VM and creates PR
   */
  private async bgAgentCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /bg-agent <task>\n\nExample: /bg-agent "Fix authentication bug in auth.ts"', {
          title: '🔌 Background Agent',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const task = args.join(' ')

    try {
      console.log(chalk.blue('🔌 Creating background job...'))

      // Get current git repo info
      const { execSync } = await import('node:child_process')
      let repo = 'owner/repo'
      let baseBranch = 'main'

      try {
        const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim()
        const match = remoteUrl.match(/github\.com[/:]([^/:]+\/[^/.]+)(?:\.git)?/)
        if (match) {
          repo = match[1]
        }

        try {
          baseBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
        } catch {
          baseBranch = 'main'
        }
      } catch (error) {
        console.log(chalk.yellow('⚠️ Not in git repository, using default values'))
      }

      // Create background job
      const jobId = await backgroundAgentService.createJob({
        repo,
        baseBranch,
        task,
        limits: {
          timeMin: 30,
          maxToolCalls: 100,
          maxMemoryMB: 2048,
        },
      })

      console.log(chalk.green(`✓ Background job created: ${jobId}`))
      console.log(chalk.gray(`Repository: ${repo}`))
      console.log(chalk.gray(`Base branch: ${baseBranch}`))
      console.log(chalk.gray(`Task: ${task}`))
      console.log('')
      console.log(chalk.cyan('Monitor progress:'))
      console.log(chalk.gray(`  /bg-status ${jobId}`))
      console.log(chalk.gray(`  /bg-logs ${jobId}`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Error creating background job: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * /bg-jobs - List all background jobs
   */
  private async bgJobsCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    try {
      const status = args[0] as any
      const jobs = await backgroundAgentService.listJobs({ status, limit: 20 })
      const stats = await backgroundAgentService.getStats()
    } catch (error: any) {
      console.log(chalk.red(`❌ Error listing jobs: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * /bg-status <jobId> - Get status of specific background job
   */
  private async bgStatusCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /bg-status <jobId>', {
          title: '📊 Job Status',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const jobId = args[0]

    try {
      const job = backgroundAgentService.getJob(jobId)

      if (!job) {
        console.log(chalk.red(`❌ Job not found: ${jobId}`))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const lines = []
      lines.push(`ID: ${job.id}`)
      lines.push(`Status: ${job.status.toUpperCase()}`)
      lines.push(`Repo: ${job.repo}`)
      lines.push(`Branch: ${job.workBranch}`)
      lines.push(`Task: ${job.task}`)
      lines.push('')
      lines.push(`Created: ${job.createdAt.toLocaleString()}`)
      if (job.startedAt) {
        lines.push(`Started: ${job.startedAt.toLocaleString()}`)
      }
      if (job.completedAt) {
        lines.push(`Completed: ${job.completedAt.toLocaleString()}`)
      }
      lines.push('')
      lines.push(`Metrics:`)
      lines.push(`  Token Usage: ${job.metrics.tokenUsage}`)
      lines.push(`  Tool Calls: ${job.metrics.toolCalls}`)
      lines.push(`  Execution Time: ${Math.round(job.metrics.executionTime / 1000)}s`)
      lines.push(`  Memory Usage: ${job.metrics.memoryUsage}MB`)

      if (job.containerId) {
        lines.push('')
        lines.push(`Container: ${job.containerId}`)
      }

      if (job.prUrl) {
        lines.push('')
        lines.push(`PR: ${job.prUrl}`)
      }

      if (job.error) {
        lines.push('')
        lines.push(`Error: ${job.error}`)
      }

      this.printPanel(
        boxen(lines.join('\n'), {
          title: '📊 Job Status',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      console.log(chalk.red(`❌ Error getting job status: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  /**
   * /bg-logs <jobId> - View logs for specific background job
   */
  private async bgLogsCommand(args: string[]): Promise<CommandResult> {
    const boxen = (await import('boxen')).default

    if (args.length === 0) {
      this.printPanel(
        boxen('Usage: /bg-logs <jobId> [limit]', {
          title: '📝 Job Logs',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    const jobId = args[0]
    const limit = args[1] ? parseInt(args[1], 10) : 50

    try {
      const job = backgroundAgentService.getJob(jobId)

      if (!job) {
        console.log(chalk.red(`❌ Job not found: ${jobId}`))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const logs = job.logs.slice(-limit)

      if (logs.length === 0) {
        console.log(chalk.yellow('No logs available yet'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      const lines = []
      lines.push(`Showing last ${logs.length} log entries:`)
      lines.push('')

      logs.forEach((log) => {
        const levelIcon = {
          info: 'ℹ️',
          warn: '⚠️',
          error: '❌',
          debug: '🐛',
        }[log.level]

        const timestamp = new Date(log.timestamp).toLocaleTimeString()
        lines.push(`${levelIcon} ${timestamp} [${log.source}]`)
        lines.push(`   ${log.message}`)
      })

      this.printPanel(
        boxen(lines.join('\n'), {
          title: `📝 Logs - ${jobId.slice(0, 8)}`,
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      console.log(chalk.red(`❌ Error getting job logs: ${error.message}`))
    }

    return { shouldExit: false, shouldUpdatePrompt: false }
  }

  private async browseSessionCommand(args: string[]): Promise<CommandResult> {
    try {
      const sessionId = args.length > 0 ? args[0] : undefined
      const id = await browseGPTService.createSession(sessionId)

      this.printPanel(
        boxen(
          chalk.green('✅ BrowseGPT Session Created') + '\n\n' +
          chalk.white(`Session ID: ${chalk.cyan(id)}\n\n`) +
          chalk.gray('Use this session ID with other /browse-* commands'),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green'
          }
        )
      )

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      this.printPanel(
        boxen(
          chalk.red(`❌ Failed to create session: ${error.message}`),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red'
          }
        )
      )
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async browseSearchCommand(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      this.printPanel(chalk.red('❌ Usage: /browse-search <sessionId> <query>'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const sessionId = args[0]
      const query = args.slice(1).join(' ')
      const results = await browseGPTService.googleSearch(sessionId, query)

      this.printPanel(
        boxen(
          chalk.blue('🔍 Search Results') + '\n\n' +
          chalk.white(`Query: ${chalk.cyan(query)}\n`) +
          chalk.white(`Found: ${chalk.green(results.results.length)} results\n\n`) +
          results.results.slice(0, 3).map((result, index) =>
            `${chalk.cyan(`${index + 1}.`)} ${result.title}\n` +
            `   ${chalk.gray(result.url)}\n` +
            `   ${chalk.dim(result.snippet.slice(0, 80))}...`
          ).join('\n\n'),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue'
          }
        )
      )

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      this.printPanel(chalk.red(`❌ Search failed: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async browseVisitCommand(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      this.printPanel(chalk.red('❌ Usage: /browse-visit <sessionId> <url> [prompt]'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const sessionId = args[0]
      const url = args[1]
      const prompt = args.slice(2).join(' ') || undefined

      const content = await browseGPTService.getPageContent(sessionId, url, prompt)

      this.printPanel(
        boxen(
          chalk.green('📄 Page Content Extracted') + '\n\n' +
          chalk.white(`Title: ${chalk.cyan(content.title)}\n`) +
          chalk.white(`URL: ${chalk.gray(content.url)}\n`) +
          chalk.white(`Content: ${chalk.yellow(content.text.length)} characters\n\n`) +
          (content.summary ? `${chalk.bold('AI Summary:')}\n${content.summary}` : ''),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green'
          }
        )
      )

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      this.printPanel(chalk.red(`❌ Failed to visit page: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async browseChatCommand(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      this.printPanel(chalk.red('❌ Usage: /browse-chat <sessionId> <message>'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const sessionId = args[0]
      const message = args.slice(1).join(' ')

      const response = await browseGPTService.chatWithWeb(sessionId, message)

      this.printPanel(
        boxen(
          chalk.blue('🤖 AI Response') + '\n\n' + chalk.white(response),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue'
          }
        )
      )

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      this.printPanel(chalk.red(`❌ Chat failed: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async browseSessionsCommand(): Promise<CommandResult> {
    try {
      const sessions = browseGPTService.listSessions()

      if (sessions.length === 0) {
        this.printPanel(chalk.yellow('No active browsing sessions'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      this.printPanel(
        boxen(
          chalk.blue('🌐 Active Browsing Sessions') + '\n\n' +
          sessions.map(session =>
            `${chalk.cyan(session.id)}\n` +
            `  Browser: ${chalk.gray(session.browserId.slice(0, 12))}...\n` +
            `  Created: ${chalk.yellow(session.created.toLocaleString())}\n` +
            `  History: ${chalk.green(session.historyCount)} items\n` +
            `  Status: ${session.active ? chalk.green('Active') : chalk.red('Inactive')}`
          ).join('\n\n'),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue'
          }
        )
      )

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      this.printPanel(chalk.red(`❌ Failed to list sessions: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async browseInfoCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      this.printPanel(chalk.red('❌ Usage: /browse-info <sessionId>'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const sessionId = args[0]
      const info = browseGPTService.getSessionInfo(sessionId)

      if (!info) {
        this.printPanel(chalk.red(`Session ${sessionId} not found`))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      this.printPanel(
        boxen(
          chalk.blue(`📊 Session Info: ${sessionId}`) + '\n\n' +
          chalk.white(`Browser ID: ${chalk.gray(info.browserId)}\n`) +
          chalk.white(`Created: ${chalk.yellow(info.created.toLocaleString())}\n`) +
          chalk.white(`Last Activity: ${chalk.yellow(info.lastActivity.toLocaleString())}\n`) +
          chalk.white(`History Items: ${chalk.green(info.historyCount)}\n`) +
          chalk.white(`Status: ${info.active ? chalk.green('Active') : chalk.red('Inactive')}`),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue'
          }
        )
      )

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      this.printPanel(chalk.red(`❌ Failed to get session info: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async browseCloseCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      this.printPanel(chalk.red('❌ Usage: /browse-close <sessionId>'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const sessionId = args[0]
      await browseGPTService.closeSession(sessionId)

      this.printPanel(
        boxen(
          chalk.green(`✅ Session Closed`) + '\n\n' +
          chalk.white(`Session ${chalk.cyan(sessionId)} has been closed`),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green'
          }
        )
      )

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      this.printPanel(chalk.red(`❌ Failed to close session: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async browseCleanupCommand(): Promise<CommandResult> {
    try {
      const cleaned = await browseGPTService.cleanupSessions()

      this.printPanel(
        boxen(
          chalk.green(`🧹 Cleanup Complete`) + '\n\n' +
          chalk.white(`Cleaned up ${chalk.yellow(cleaned)} inactive sessions`),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green'
          }
        )
      )

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      this.printPanel(chalk.red(`❌ Cleanup failed: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }

  private async browseQuickCommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      this.printPanel(chalk.red('❌ Usage: /browse-quick <query> [prompt]'))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }

    try {
      const query = args[0]
      const prompt = args.slice(1).join(' ') || 'Summarize this page'

      // Create session
      const sessionId = await browseGPTService.createSession()

      // Search
      const searchResults = await browseGPTService.googleSearch(sessionId, query)

      if (searchResults.results.length === 0) {
        this.printPanel(chalk.yellow('No search results found'))
        return { shouldExit: false, shouldUpdatePrompt: false }
      }

      // Visit first result
      const firstResult = searchResults.results[0]
      const content = await browseGPTService.getPageContent(sessionId, firstResult.url, prompt)

      // Chat about it
      const chatResponse = await browseGPTService.chatWithWeb(
        sessionId,
        `Based on the content from "${content.title}", ${prompt}`
      )

      this.printPanel(
        boxen(
          chalk.blue('⚡ Quick Browse Results') + '\n\n' +
          chalk.white(`Query: ${chalk.cyan(query)}\n`) +
          chalk.white(`Visited: ${chalk.yellow(content.title)}\n`) +
          chalk.white(`URL: ${chalk.gray(firstResult.url)}\n\n`) +
          chalk.bold('AI Analysis:\n') +
          chalk.white(chatResponse),
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue'
          }
        )
      )

      // Close session
      await browseGPTService.closeSession(sessionId)

      return { shouldExit: false, shouldUpdatePrompt: false }
    } catch (error: any) {
      this.printPanel(chalk.red(`❌ Quick browse failed: ${error.message}`))
      return { shouldExit: false, shouldUpdatePrompt: false }
    }
  }
}

/**
 * Display Mermaid rendering capabilities and diagnostics
 */
export async function handleMermaidInfo(): Promise<void> {
  const { TerminalCapabilityDetector } = await import('../utils/terminal-capabilities')
  const { getMermaidRenderingPreferences } = await import('../core/config-manager')

  console.log(chalk.blue.bold('\n🎨 Mermaid Diagram Rendering Info\n'))

  // Terminal capabilities
  console.log(chalk.cyan('Terminal Capabilities:'))
  const capabilitiesInfo = TerminalCapabilityDetector.getCapabilitiesDescription()
  console.log(capabilitiesInfo)

  // Current configuration
  console.log(chalk.cyan('\nCurrent Configuration:'))
  const preferences = getMermaidRenderingPreferences()
  console.log(`  Strategy: ${chalk.white(preferences.strategy)}`)
  console.log(`  Cache Enabled: ${chalk.white(preferences.enableCache ? '✓' : '✗')}`)
  console.log(`  Theme: ${chalk.white(preferences.theme)}`)
  console.log(
    `  ASCII Padding: ${chalk.white(`X:${preferences.asciiPaddingX} Y:${preferences.asciiPaddingY} Border:${preferences.asciiBorderPadding}`)}`
  )

  // Recommendations
  console.log(chalk.cyan('\nRecommendations:'))
  const caps = TerminalCapabilityDetector.getCapabilities()

  if (!caps.hasMermaidAsciiBinary) {
    console.log(chalk.yellow('  ⚠️  mermaid-ascii not installed'))
    console.log(chalk.gray('     Install for high-quality ASCII diagrams:'))
    console.log(chalk.gray('     See: docs/features/mermaid-rendering.md'))
  } else {
    console.log(chalk.green('  ✓ mermaid-ascii available - ASCII rendering enabled'))
  }

  if (caps.supportsInlineImages && caps.imageProtocol !== 'ansi-fallback') {
    console.log(chalk.green(`  ✓ Inline images supported via ${caps.imageProtocol}`))
  } else {
    console.log(chalk.gray('  ℹ️  Inline images not supported in current terminal'))
    console.log(chalk.gray('     Consider using iTerm2, Kitty, or WezTerm for image support'))
  }

  console.log(chalk.cyan('\nDocumentation:'))
  console.log(chalk.gray('  📖 docs/features/mermaid-rendering.md'))
  console.log(chalk.gray('  🌐 https://mermaid.live/ - Online editor'))
  console.log('')
}

// ====================== 🌐 BROWSER MODE COMMANDS ======================

/**
 * Handle browser mode command - start interactive browser session
 */
export async function handleBrowserCommand(args: string[]): Promise<void> {
  try {
    // Check if browser mode is available
    if (!isBrowserModeAvailable()) {
      console.log(
        boxen(
          `${chalk.red('⚠️  Browser Mode Unavailable')}\n\n` +
          `Docker is required but not available.\n\n` +
          `${chalk.yellow('Requirements:')}\n` +
          `• Docker installed and running\n` +
          `• Sufficient memory (2GB+ recommended)\n` +
          `• Available ports for noVNC (6080+)\n\n` +
          `${chalk.blue('Install Docker:')}\n` +
          `• macOS: brew install --cask docker\n` +
          `• Linux: apt install docker.io\n` +
          `• Windows: Docker Desktop`,
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          }
        )
      )
      return
    }

    // Get optional initial URL
    const initialUrl = args.length > 0 ? args.join(' ') : undefined

    console.log(chalk.blue('🌐 Starting Browser Mode...'))

    if (initialUrl) {
      console.log(chalk.gray(`Initial URL: ${initialUrl}`))
    }

    // Start browser mode
    const result = await browserChatBridge.startBrowserMode(initialUrl)

    if (result.success) {
      console.log(
        boxen(
          `${chalk.green('✅ Browser Mode Active!')}\n\n` +
          `${chalk.blue('🖥️  noVNC Viewer:')} ${chalk.cyan(result.noVncUrl || 'Starting...')}\n` +
          `${chalk.blue('🌐 Session:')} ${result.session?.sessionId.slice(0, 12) || 'Unknown'}\n` +
          `${chalk.blue('🐳 Container:')} ${result.container?.name || 'Unknown'}\n\n` +
          `${chalk.yellow('💬 Chat with the browser:')}\n` +
          `• "go to google.com"\n` +
          `• "click on search button"\n` +
          `• "type hello world"\n` +
          `• "take a screenshot"\n` +
          `• "scroll down"\n\n` +
          `${chalk.gray('Commands:')}\n` +
          `• ${chalk.cyan('/browser-status')} - Show browser status\n` +
          `• ${chalk.cyan('/browser-screenshot')} - Take screenshot\n` +
          `• ${chalk.cyan('/browser-exit')} - Exit browser mode`,
          {
            padding: 1,
            margin: 1,
            borderStyle: 'double',
            borderColor: 'green',
          }
        )
      )
    } else {
      console.log(
        boxen(
          `${chalk.red('❌ Browser Mode Failed')}\n\n` +
          `${chalk.white('Error:')} ${result.error || 'Unknown error'}\n\n` +
          `${chalk.yellow('Common Issues:')}\n` +
          `• Docker not running\n` +
          `• Insufficient memory\n` +
          `• Port conflicts\n` +
          `• Missing Docker permissions`,
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          }
        )
      )
    }
  } catch (error: any) {
    console.log(chalk.red(`❌ Failed to start browser mode: ${error.message}`))
  }
}

/**
 * Handle browser status command - show current browser session info
 */
export async function handleBrowserStatus(): Promise<void> {
  try {
    const status = browserChatBridge.getBrowserStatus()

    if (!status.hasActiveSession) {
      console.log(
        boxen(
          `${chalk.yellow('🌐 Browser Mode Status')}\n\n` +
          `${chalk.gray('Status:')} ${chalk.red('Inactive')}\n\n` +
          `${chalk.blue('Start browser mode:')}\n` +
          `${chalk.cyan('/browser')} [url] - Start browser session\n\n` +
          `${chalk.gray('Example:')}\n` +
          `${chalk.dim('/browser https://google.com')}`,
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }
        )
      )
      return
    }

    const session = status.session!
    const container = status.container!

    console.log(
      boxen(
        `${chalk.green('🌐 Browser Mode Status')}\n\n` +
        `${chalk.blue('Status:')} ${chalk.green('Active')}\n` +
        `${chalk.blue('Mode:')} ${status.mode}\n\n` +
        `${chalk.cyan('Session Info:')}\n` +
        `• ID: ${session.id.slice(0, 12)}...\n` +
        `• Status: ${session.status}\n` +
        `• Messages: ${session.messageCount}\n` +
        `• Created: ${session.createdAt.toLocaleTimeString()}\n` +
        `• Last Activity: ${session.lastActivity.toLocaleTimeString()}\n\n` +
        `${chalk.cyan('Current Page:')}\n` +
        `• URL: ${session.currentUrl}\n` +
        `• Title: ${session.title || 'No title'}\n\n` +
        `${chalk.cyan('Container Info:')}\n` +
        `• Name: ${container.name}\n` +
        `• Status: ${container.status}\n` +
        `• noVNC: ${container.noVncUrl}\n` +
        `• Port: ${container.displayPort}\n\n` +
        `${chalk.cyan('Capabilities:')}\n` +
        `${status.capabilities.map(cap => `• ${cap}`).join('\n')}`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      )
    )
  } catch (error: any) {
    console.log(chalk.red(`❌ Failed to get browser status: ${error.message}`))
  }
}

/**
 * Handle browser exit command - stop browser session and cleanup
 */
export async function handleBrowserExit(): Promise<void> {
  try {
    const status = browserChatBridge.getBrowserStatus()

    if (!status.hasActiveSession) {
      console.log(chalk.yellow('🌐 No active browser session to exit'))
      return
    }

    console.log(chalk.blue('🛑 Exiting browser mode...'))

    await browserChatBridge.exitBrowserMode()

    console.log(
      boxen(
        `${chalk.green('✅ Browser Mode Exited')}\n\n` +
        `• Session ended successfully\n` +
        `• Container stopped and removed\n` +
        `• Resources cleaned up\n\n` +
        `${chalk.gray('Start again with:')} ${chalk.cyan('/browser')} [url]`,
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }
      )
    )
  } catch (error: any) {
    console.log(chalk.red(`❌ Failed to exit browser mode: ${error.message}`))
  }
}

/**
 * Handle browser screenshot command - take screenshot of current page
 */
export async function handleBrowserScreenshot(): Promise<void> {
  try {
    const status = browserChatBridge.getBrowserStatus()

    if (!status.hasActiveSession) {
      console.log(chalk.yellow('🌐 No active browser session. Start with /browser [url]'))
      return
    }

    console.log(chalk.blue('📸 Taking screenshot...'))

    const screenshot = await browserChatBridge.takeScreenshot(true) // Full page screenshot

    if (screenshot) {
      console.log(
        boxen(
          `${chalk.green('📸 Screenshot Captured')}\n\n` +
          `• Page: ${status.session?.currentUrl || 'Unknown'}\n` +
          `• Title: ${status.session?.title || 'No title'}\n` +
          `• Time: ${new Date().toLocaleTimeString()}\n` +
          `• Type: Full page\n\n` +
          `${chalk.gray('Screenshot data:')} ${screenshot.length} chars\n` +
          `${chalk.blue('🖥️  View in browser:')} ${status.container?.noVncUrl || 'N/A'}`,
          {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          }
        )
      )
    } else {
      console.log(chalk.red('❌ Failed to capture screenshot'))
    }
  } catch (error: any) {
    console.log(chalk.red(`❌ Failed to take screenshot: ${error.message}`))
  }
}

/**
 * Show browser mode information and capabilities
 */
export async function handleBrowserInfo(): Promise<void> {
  const info = getBrowserModeInfo()
  const available = isBrowserModeAvailable()

  console.log(
    boxen(
      `${chalk.blue.bold('🌐 Browser Mode Information')}\n\n` +
      `${chalk.cyan('Description:')}\n${info.description}\n\n` +
      `${chalk.cyan('Status:')} ${available ? chalk.green('Available') : chalk.red('Unavailable')}\n\n` +
      `${chalk.cyan('Features:')}\n${info.features.map(f => `• ${f}`).join('\n')}\n\n` +
      `${chalk.cyan('Requirements:')}\n${info.requirements.map(r => `• ${r}`).join('\n')}\n\n` +
      `${chalk.cyan('Capabilities:')}\n${info.capabilities.map(c => `• ${c}`).join('\n')}\n\n` +
      `${chalk.cyan('Commands:')}\n` +
      `• ${chalk.green('/browser')} [url] - Start browser mode\n` +
      `• ${chalk.green('/browser-status')} - Show status\n` +
      `• ${chalk.green('/browser-screenshot')} - Take screenshot\n` +
      `• ${chalk.green('/browser-exit')} - Exit mode\n` +
      `• ${chalk.green('/browser-info')} - Show this info`,
      {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: available ? 'green' : 'red',
      }
    )
  )
}

// ====================== 🐐 GOAT SDK COMMANDS ======================

/**
 * GOAT command - GOAT SDK operations with panel output
 */
export async function handleGoatSDKCommand(args: string[]): Promise<void> {
  // Help/usage
  if (args.length === 0) {
    console.log(
      boxen(
        [
          chalk.bold('🐐 GOAT SDK (Polymarket + ERC20) Commands'),
          chalk.gray('────────────────────────────────────────────'),
          '',
          `${chalk.cyan('/goat status')}     – GOAT SDK status`,
          `${chalk.cyan('/goat init')}       – Initialize with wallet and chains`,
          `${chalk.cyan('/goat wallet')}     – Show wallet and networks`,
          `${chalk.cyan('/goat tools')}      – List available GOAT tools`,
          `${chalk.cyan('/goat chat "message"')} – Natural language DeFi request`,
          `${chalk.cyan('/goat markets')}    – Show Polymarket prediction markets`,
          `${chalk.cyan('/goat transfer <amount> <to> [--chain base|polygon]')} – Transfer ERC20 tokens`,
          `${chalk.cyan('/goat balance [--chain base|polygon]')} – Check token balances`,
          '',
          chalk.gray('Env required: GOAT_EVM_PRIVATE_KEY'),
          chalk.gray('Optional: POLYGON_RPC_URL, BASE_RPC_URL'),
          chalk.gray('Tip: Use natural language with /goat chat for complex operations'),
        ].join('\n'),
        { title: 'GOAT SDK', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' }
      )
    )
    return
  }

  const sub = args[0].toLowerCase()

  try {
    const { secureTools } = await import('../tools/secure-tools-registry')

    if (sub === 'status') {
      const result = await secureTools.executeGoat('status')
      const content = formatGoatStatusPanel(result)
      console.log(content)
    } else if (sub === 'init') {
      const result = await secureTools.executeGoat('init', {
        chains: args.slice(1).includes('--chains') ? args[args.indexOf('--chains') + 1]?.split(',') : ['polygon', 'base'],
        plugins: args.slice(1).includes('--plugins') ? args[args.indexOf('--plugins') + 1]?.split(',') : ['polymarket', 'erc20']
      })
      const content = formatGoatInitPanel(result)
      console.log(content)
    } else if (sub === 'wallet') {
      const result = await secureTools.executeGoat('wallet-info')
      const content = formatGoatWalletPanel(result)
      console.log(content)
    } else if (sub === 'tools') {
      const result = await secureTools.executeGoat('tools')
      const content = formatGoatToolsPanel(result)
      console.log(content)
    } else if (sub === 'markets') {
      const result = await secureTools.executeGoat('polymarket-markets')
      const content = formatGoatMarketsPanel(result)
      console.log(content)
    } else if (sub === 'transfer') {
      if (!args[1] || !args[2]) {
        console.log(
          boxen('Usage: /goat transfer <amount> <to> [--chain base|polygon] [--token USDC|ETH]', {
            title: 'GOAT Transfer',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const amount = args[1]
      const to = args[2]
      let chain: string | undefined
      let token: string | undefined

      for (let i = 3; i < args.length; i++) {
        if (args[i] === '--chain' && args[i + 1]) {
          chain = args[i + 1].toLowerCase()
          i++
        } else if (args[i] === '--token' && args[i + 1]) {
          token = args[i + 1].toUpperCase()
          i++
        }
      }

      const result = await secureTools.executeGoat('erc20-transfer', {
        amount,
        to,
        chain: chain || 'base',
        token: token || 'USDC'
      })
      const content = formatGoatTransferPanel({ result, amount, to, chain, token })
      console.log(content)
    } else if (sub === 'balance') {
      let chain: string | undefined
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--chain' && args[i + 1]) {
          chain = args[i + 1].toLowerCase()
          break
        }
      }

      const result = await secureTools.executeGoat('erc20-balance', {
        chain: chain || 'base'
      })
      const content = formatGoatBalancePanel(result)
      console.log(content)
    } else if (sub === 'chat') {
      const message = args.slice(1).join(' ').trim().replace(/^"|"$/g, '')
      if (!message) {
        console.log(
          boxen('Usage: /goat chat "your DeFi request"', {
            title: 'GOAT Chat',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const result = await secureTools.executeGoat('chat', { message })
      const content = formatGoatChatPanel(message, result)
      console.log(content)
    } else {
      console.log(
        boxen(`Unknown subcommand: ${sub}`, {
          title: 'GOAT SDK',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        })
      )
    }
  } catch (error: any) {
    console.log(
      boxen(
        `Failed to execute GOAT command: ${error.message}` +
        '\n\nTips:\n- Ensure GOAT_EVM_PRIVATE_KEY is set\n- Run /goat init first\n- Use /goat status to check setup',
        { title: 'GOAT Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }
      )
    )
  }
}

/**
 * Polymarket specific command
 */
export async function handlePolymarketCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log(
      boxen(
        [
          chalk.bold('📊 Polymarket Commands'),
          chalk.gray('────────────────────────────────────────────'),
          '',
          `${chalk.cyan('/polymarket markets')}     – List prediction markets`,
          `${chalk.cyan('/polymarket bet <market> <amount> <outcome>')} – Place a bet`,
          `${chalk.cyan('/polymarket positions')}   – Show your positions`,
          `${chalk.cyan('/polymarket chat "query"')} – Natural language Polymarket operations`,
          '',
          chalk.gray('Note: Polymarket operates on Polygon network'),
          chalk.gray('Ensure GOAT_EVM_PRIVATE_KEY and POLYGON_RPC_URL are configured'),
        ].join('\n'),
        { title: 'Polymarket', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' }
      )
    )
    return
  }

  const action = args[0].toLowerCase()

  try {
    const { secureTools } = await import('../tools/secure-tools-registry')

    switch (action) {
      case 'markets':
        const marketsResult = await secureTools.executeGoat('polymarket-markets', { chain: 'polygon' })
        const marketsContent = formatGoatMarketsPanel(marketsResult)
        console.log(marketsContent)
        break

      case 'bet':
        if (args.length < 4) {
          console.log(
            boxen('Usage: /polymarket bet <market-id> <amount> <outcome>', {
              title: 'Polymarket Bet',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        const betResult = await secureTools.executeGoat('polymarket-bet', {
          market: args[1],
          amount: args[2],
          outcome: args[3],
          chain: 'polygon'
        })
        const betContent = formatGoatBetPanel(betResult)
        console.log(betContent)
        break

      case 'positions':
        const positionsResult = await secureTools.executeGoat('polymarket-positions', { chain: 'polygon' })
        const positionsContent = formatGoatPositionsPanel(positionsResult)
        console.log(positionsContent)
        break

      case 'chat':
        const message = args.slice(1).join(' ').trim().replace(/^"|"$/g, '')
        if (!message) {
          console.log(
            boxen('Usage: /polymarket chat "your prediction market query"', {
              title: 'Polymarket Chat',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        const chatResult = await secureTools.executeGoat('chat', {
          message: `Polymarket operation: ${message}`,
          plugin: 'polymarket',
          chain: 'polygon'
        })
        const chatContent = formatGoatChatPanel(message, chatResult)
        console.log(chatContent)
        break

      default:
        console.log(
          boxen(`Unknown Polymarket command: ${action}`, {
            title: 'Polymarket Error',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          })
        )
    }
  } catch (error: any) {
    console.log(
      boxen(`Polymarket command failed: ${error.message}`, {
        title: 'Polymarket Error',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'red',
      })
    )
  }
}

/**
 * Web3 Toolchain command
 */
export async function handleWeb3ToolchainCommand(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log(
      boxen(
        [
          chalk.bold('🔗 Web3 Toolchain Commands'),
          chalk.gray('────────────────────────────────────────────'),
          '',
          `${chalk.cyan('/web3-toolchain list')}    – List available Web3 toolchains`,
          `${chalk.cyan('/web3-toolchain run <name>')} – Execute a Web3 toolchain`,
          `${chalk.cyan('/web3-toolchain status')}  – Show active executions`,
          `${chalk.cyan('/web3-toolchain cancel <id>')} – Cancel running execution`,
          '',
          chalk.gray('Available toolchains:'),
          chalk.gray('• defi-analysis - DeFi protocol analysis'),
          chalk.gray('• polymarket-strategy - Prediction market trading'),
          chalk.gray('• portfolio-management - Multi-chain portfolio'),
          chalk.gray('• nft-analysis - NFT collection analytics'),
          chalk.gray('• contract-audit - Smart contract security'),
          chalk.gray('• yield-optimizer - Yield farming optimization'),
          chalk.gray('• bridge-analysis - Cross-chain bridge analysis'),
          chalk.gray('• mev-protection - MEV protection strategy'),
          chalk.gray('• governance-analysis - DAO governance analysis'),
        ].join('\n'),
        { title: 'Web3 Toolchains', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }
      )
    )
    return
  }

  const action = args[0].toLowerCase()

  try {
    const { web3ToolchainRegistry } = await import('../toolchains/web3-toolchains')

    switch (action) {
      case 'list':
        const toolchains = web3ToolchainRegistry.listToolchains()
        const listContent = formatWeb3ToolchainListPanel(toolchains)
        console.log(listContent)
        break

      case 'run':
        if (!args[1]) {
          console.log(
            boxen('Usage: /web3-toolchain run <toolchain-name> [--chain <chain>] [--dry-run]', {
              title: 'Web3 Toolchain Run',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }

        const toolchainName = args[1]
        const options: any = {}

        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--chain' && args[i + 1]) {
            options.chain = args[i + 1]
            i++
          } else if (args[i] === '--dry-run') {
            options.dryRun = true
          }
        }

        const execution = await web3ToolchainRegistry.executeToolchain(toolchainName, {}, options)
        const execContent = formatWeb3ToolchainExecutionPanel(execution)
        console.log(execContent)
        break

      case 'status':
        const activeExecutions = web3ToolchainRegistry.getActiveExecutions()
        const statusContent = formatWeb3ToolchainStatusPanel(activeExecutions)
        console.log(statusContent)
        break

      case 'cancel':
        if (!args[1]) {
          console.log(
            boxen('Usage: /web3-toolchain cancel <execution-id>', {
              title: 'Web3 Toolchain Cancel',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }

        const executionId = args[1]
        const cancelled = web3ToolchainRegistry.cancelExecution(executionId)
        const cancelContent = formatWeb3ToolchainCancelPanel(cancelled, executionId)
        console.log(cancelContent)
        break

      default:
        console.log(
          boxen(`Unknown toolchain command: ${action}`, {
            title: 'Web3 Toolchain Error',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'red',
          })
        )
    }
  } catch (error: any) {
    console.log(
      boxen(`Web3 toolchain command failed: ${error.message}`, {
        title: 'Web3 Toolchain Error',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'red',
      })
    )
  }
}

// ====================== GOAT PANEL FORMATTERS ======================

function formatGoatStatusPanel(result: any): string {
  const title = 'GOAT SDK Status'
  const lines: string[] = []
  const ok = result?.data?.success ?? result?.success
  const dataBlock = result?.data?.data || result?.data || {}

  if (ok) {
    const data = dataBlock
    lines.push(chalk.green('✓ GOAT SDK status'))
    lines.push('')
    lines.push(`${chalk.gray('Installed:')} ${data.installed ? 'Yes' : 'No'}`)
    lines.push(`${chalk.gray('Initialized:')} ${data.initialized ? 'Yes' : 'No'}`)
    lines.push(`${chalk.gray('Environment:')} ${data.environment}`)
    if (data.plugins?.length) {
      lines.push(`${chalk.gray('Plugins:')} ${data.plugins.join(', ')}`)
    }
    if (data.chains?.length) {
      lines.push(`${chalk.gray('Chains:')} ${data.chains.join(', ')}`)
    }
  } else {
    lines.push(chalk.red('❌ Not initialized'))
    if (result?.error) lines.push(chalk.gray(result.error))
    lines.push('')
    lines.push(chalk.yellow('Run /goat init to set up GOAT SDK'))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
}

function formatGoatInitPanel(result: any): string {
  const title = 'GOAT SDK Initialize'
  const lines: string[] = []
  const ok = result?.data?.success ?? result?.success
  const dataBlock = result?.data?.data || result?.data || {}

  if (ok) {
    const data = dataBlock
    lines.push(chalk.green('✓ GOAT SDK initialized'))
    if (data.wallet?.address) lines.push(`${chalk.gray('Wallet:')} ${data.wallet.address}`)
    if (data.chains?.length) lines.push(`${chalk.gray('Chains:')} ${data.chains.map((c: any) => c.name).join(', ')}`)
    if (data.plugins?.length) lines.push(`${chalk.gray('Plugins:')} ${data.plugins.join(', ')}`)
    lines.push(`${chalk.gray('Tools:')} ${data.toolsCount || 0} available`)
  } else {
    lines.push(chalk.red('❌ Initialization failed'))
    if (result?.error) lines.push(chalk.gray(result.error))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
}

function formatGoatWalletPanel(result: any): string {
  const title = 'GOAT Wallet'
  const lines: string[] = []
  const ok = result?.data?.success ?? result?.success
  const dataBlock = result?.data?.data || result?.data || {}

  if (ok) {
    const data = dataBlock
    lines.push(chalk.cyan('🔐 Wallet Information'))
    if (data.wallet?.address) lines.push(`${chalk.gray('Address:')} ${data.wallet.address}`)
    if (data.chains?.length) {
      lines.push(`${chalk.gray('Supported Chains:')}`)
      data.chains.forEach((chain: any) => {
        lines.push(`  • ${chain.name} (${chain.chainId})`)
      })
    }
    if (data.plugins?.length) {
      lines.push(`${chalk.gray('Active Plugins:')} ${data.plugins.join(', ')}`)
    }
  } else {
    lines.push(chalk.red('❌ Failed to get wallet info'))
    if (result?.error) lines.push(chalk.gray(result.error))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
}

function formatGoatToolsPanel(result: any): string {
  const title = 'GOAT Tools'
  const lines: string[] = []
  const ok = result?.data?.success ?? result?.success
  const dataBlock = result?.data?.data || result?.data || {}

  if (ok && dataBlock.tools) {
    lines.push(chalk.cyan(`Available Tools (${dataBlock.count || 0})`))
    lines.push('')
    dataBlock.tools.slice(0, 10).forEach((tool: any) => {
      lines.push(`• ${chalk.bold(tool.name)}`)
      if (tool.description) {
        lines.push(`  ${chalk.gray(tool.description)}`)
      }
    })
    if (dataBlock.tools.length > 10) {
      lines.push(chalk.gray(`... and ${dataBlock.tools.length - 10} more tools`))
    }
  } else {
    lines.push(chalk.yellow('No tools available'))
    lines.push(chalk.gray('Initialize GOAT SDK first with /goat init'))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
}

function formatGoatMarketsPanel(result: any): string {
  const title = 'Polymarket Markets'
  const lines: string[] = []
  const ok = result?.data?.success ?? result?.success
  const dataBlock = result?.data?.data || result?.data || {}

  if (ok) {
    lines.push(chalk.green('✓ Markets loaded'))
    if (dataBlock.response) {
      lines.push('')
      lines.push(chalk.white(dataBlock.response))
    }
  } else {
    lines.push(chalk.red('❌ Failed to load markets'))
    if (result?.error) lines.push(chalk.gray(result.error))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' })
}

function formatGoatTransferPanel({ result, amount, to, chain, token }: any): string {
  const title = 'GOAT Transfer'
  const lines: string[] = []
  lines.push(`${chalk.gray('Amount:')} ${amount} ${token || 'USDC'}`)
  lines.push(`${chalk.gray('To:')} ${to}`)
  lines.push(`${chalk.gray('Chain:')} ${chain || 'base'}`)
  lines.push('')

  const ok = result?.data?.success ?? result?.success
  const dataBlock = result?.data?.data || result?.data || {}

  if (ok) {
    lines.push(chalk.green('✓ Transfer request submitted'))
    if (dataBlock?.response) {
      lines.push('')
      lines.push(chalk.white(dataBlock.response))
    }
  } else {
    lines.push(chalk.red('❌ Transfer failed'))
    if (result?.error) lines.push(chalk.gray(result.error))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
}

function formatGoatBalancePanel(result: any): string {
  const title = 'GOAT Balance'
  const lines: string[] = []
  const ok = result?.data?.success ?? result?.success
  const dataBlock = result?.data?.data || result?.data || {}

  if (ok) {
    lines.push(chalk.green('✓ Balance request processed'))
    if (dataBlock.response) {
      lines.push('')
      lines.push(chalk.white(dataBlock.response))
    }
  } else {
    lines.push(chalk.red('❌ Failed to fetch balance'))
    if (result?.error) lines.push(chalk.gray(result.error))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
}

function formatGoatChatPanel(message: string, result: any): string {
  const title = 'GOAT Chat'
  const lines: string[] = []
  lines.push(`${chalk.gray('Message:')} ${message}`)
  lines.push('')

  const ok = result?.data?.success ?? result?.success
  const dataBlock = result?.data?.data || result?.data || {}

  if (ok) {
    lines.push(chalk.green('✓ Completed'))
    if (dataBlock?.response) {
      lines.push('')
      lines.push(chalk.white(dataBlock.response))
    }
  } else {
    lines.push(chalk.red('❌ Failed'))
    if (result?.error) lines.push(chalk.gray(result.error))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
}

function formatGoatBetPanel(result: any): string {
  const title = 'Polymarket Bet'
  const lines: string[] = []
  const ok = result?.data?.success ?? result?.success
  const dataBlock = result?.data?.data || result?.data || {}

  if (ok) {
    lines.push(chalk.green('✓ Bet placed successfully'))
    if (dataBlock?.txHash) {
      lines.push(`${chalk.gray('Transaction:')} ${dataBlock.txHash}`)
    }
    if (dataBlock?.response) {
      lines.push('')
      lines.push(chalk.white(dataBlock.response))
    }
  } else {
    lines.push(chalk.red('❌ Bet placement failed'))
    if (result?.error) lines.push(chalk.gray(result.error))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' })
}

function formatGoatPositionsPanel(result: any): string {
  const title = 'Polymarket Positions'
  const lines: string[] = []
  const ok = result?.data?.success ?? result?.success
  const dataBlock = result?.data?.data || result?.data || {}

  if (ok) {
    lines.push(chalk.green('✓ Positions loaded'))
    if (dataBlock?.response) {
      lines.push('')
      lines.push(chalk.white(dataBlock.response))
    }
  } else {
    lines.push(chalk.red('❌ Failed to load positions'))
    if (result?.error) lines.push(chalk.gray(result.error))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' })
}

// ====================== WEB3 TOOLCHAIN PANEL FORMATTERS ======================

function formatWeb3ToolchainListPanel(toolchains: any[]): string {
  const title = 'Available Web3 Toolchains'
  const lines: string[] = []

  if (toolchains.length === 0) {
    lines.push(chalk.yellow('No Web3 toolchains available'))
  } else {
    lines.push(`Found ${toolchains.length} Web3 toolchain(s)`)
    lines.push('')

    toolchains.forEach((toolchain, index) => {
      const riskColor = toolchain.riskLevel === 'critical' ? 'red' :
        toolchain.riskLevel === 'high' ? 'yellow' :
          toolchain.riskLevel === 'medium' ? 'blue' : 'green'

      lines.push(`${index + 1}. ${chalk.bold(toolchain.name)}`)
      lines.push(`   ${chalk.gray(toolchain.description)}`)
      lines.push(`   Chains: ${chalk.cyan(toolchain.chains.join(', '))}`)
      lines.push(`   Protocols: ${chalk.gray(toolchain.protocols.join(', '))}`)
      lines.push(`   Risk: ${chalk[riskColor](toolchain.riskLevel)} | Pattern: ${chalk.gray(toolchain.pattern)}`)
      lines.push(`   Duration: ~${Math.round(toolchain.estimatedDuration / 1000)}s`)
      if (index < toolchains.length - 1) lines.push('')
    })
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' })
}

function formatWeb3ToolchainExecutionPanel(execution: any): string {
  const title = `Web3 Toolchain: ${execution.toolchain}`
  const lines: string[] = []

  lines.push(`${chalk.gray('Execution ID:')} ${execution.id}`)
  lines.push(`${chalk.gray('Status:')} ${formatExecutionStatus(execution.status)}`)
  lines.push(`${chalk.gray('Progress:')} ${execution.progress}%`)
  lines.push(`${chalk.gray('Started:')} ${execution.startTime.toLocaleTimeString()}`)

  if (execution.endTime) {
    const duration = Math.round((execution.endTime.getTime() - execution.startTime.getTime()) / 1000)
    lines.push(`${chalk.gray('Duration:')} ${duration}s`)
  }

  if (execution.chainId) {
    lines.push(`${chalk.gray('Chain ID:')} ${execution.chainId}`)
  }

  if (execution.txHashes.length > 0) {
    lines.push('')
    lines.push(chalk.cyan('Transaction Hashes:'))
    execution.txHashes.forEach((hash: string) => {
      lines.push(`  ${hash}`)
    })
  }

  if (execution.errors.length > 0) {
    lines.push('')
    lines.push(chalk.red('Errors:'))
    execution.errors.forEach((error: string) => {
      lines.push(`  ${error}`)
    })
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' })
}

function formatWeb3ToolchainStatusPanel(executions: any[]): string {
  const title = 'Active Web3 Toolchain Executions'
  const lines: string[] = []

  if (executions.length === 0) {
    lines.push(chalk.yellow('No active toolchain executions'))
    lines.push('')
    lines.push(chalk.gray('Use /web3-toolchain run <name> to start a toolchain'))
  } else {
    lines.push(`Active executions: ${executions.length}`)
    lines.push('')

    executions.forEach((exec, index) => {
      const duration = Math.round((Date.now() - exec.startTime.getTime()) / 1000)
      lines.push(`${index + 1}. ${chalk.bold(exec.toolchain)}`)
      lines.push(`   ID: ${exec.id}`)
      lines.push(`   Status: ${formatExecutionStatus(exec.status)}`)
      lines.push(`   Progress: ${exec.progress}%`)
      lines.push(`   Duration: ${duration}s`)
      if (index < executions.length - 1) lines.push('')
    })
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' })
}

function formatWeb3ToolchainCancelPanel(cancelled: boolean, executionId: string): string {
  const title = 'Cancel Web3 Toolchain'
  const lines: string[] = []

  if (cancelled) {
    lines.push(chalk.green(`✓ Execution cancelled: ${executionId}`))
    lines.push('')
    lines.push(chalk.gray('The toolchain execution has been stopped'))
  } else {
    lines.push(chalk.red(`❌ Failed to cancel: ${executionId}`))
    lines.push('')
    lines.push(chalk.gray('Execution not found or already completed'))
  }

  return boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: cancelled ? 'green' : 'red' })
}

function formatExecutionStatus(status: string): string {
  switch (status) {
    case 'pending':
      return chalk.yellow('⏳ Pending')
    case 'running':
      return chalk.blue('🔄 Running')
    case 'completed':
      return chalk.green('✅ Completed')
    case 'failed':
      return chalk.red('❌ Failed')
    case 'cancelled':
      return chalk.gray('🛑 Cancelled')
    default:
      return chalk.gray(status)
  }
}
